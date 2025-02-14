/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Builder;
import lombok.Getter;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Setter;

@Setter
@Getter
@Builder
public class TestResult {

    @JsonIgnore
    private final Object lock = new Object();

    private String testId;
    private String description;
    private String url;
    private String method;
    private String className;
    private String methodName;
    private boolean completed;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private int totalRequests;
    private int successfulRequests;
    private int failedRequests;
    private double averageResponseTime;
    private double maxResponseTime;
    private double minResponseTime;
    private double requestsPerSecond;
    private double errorRate;
    private String status;
    private String errorMessage;
    private Long latestResponseTime;
    private ThreadMetrics threadMetrics;

    // Memory monitoring
    private double averageHeapUsage;
    private double maxHeapUsage;
    private int totalGCCount;
    private long totalGCTime;

    // mutable lists
    @Builder.Default
    private final List<MemoryMetrics> memoryMetrics = new ArrayList<>();
    @Builder.Default
    private final List<Long> responseTimes = new ArrayList<>();

    public synchronized void updateThreadMetrics(ThreadMetrics metrics) {
        this.threadMetrics = metrics;
    }

    public synchronized void updateProgress(int totalRequests, int successfulRequests,
        int failedRequests) {
        synchronized (lock) {
            this.totalRequests = totalRequests;
            this.successfulRequests = successfulRequests;
            this.failedRequests = failedRequests;

            if (totalRequests > 0) {
                this.errorRate = failedRequests * 100.0 / totalRequests;
                this.averageResponseTime = this.responseTimes.stream()
                    .mapToLong(Long::valueOf)
                    .average()
                    .orElse(0.0);

                double duration =
                    java.time.Duration.between(startTime, LocalDateTime.now()).toMillis() / 1000.0;
                this.requestsPerSecond = duration > 0 ? totalRequests / duration : 0;
            }
        }
    }

    public synchronized void addMemoryMetric(MemoryMetrics metric) {
        synchronized (lock) {
            this.memoryMetrics.add(metric);

            // update avg heap useage
            this.averageHeapUsage = this.memoryMetrics.stream()
                .mapToLong(MemoryMetrics::getHeapUsed)
                .average()
                .orElse(0.0);

            // update max heap usage
            this.maxHeapUsage = this.memoryMetrics.stream()
                .mapToLong(MemoryMetrics::getHeapUsed)
                .max()
                .orElse(0);
        }
    }

    @Getter
    @Builder.Default
    private final Map<Integer, Double> responseTimePercentiles = new ConcurrentHashMap<>();

    /**
     * Calculates and updates the key percentiles (50th, 75th, 95th, 99th) of response times.
     * 주요 응답 시간 백분위수(50, 75, 95, 99)를 계산하고 업데이트
     *
     * This method is called after each response time addition to maintain real-time statistics.
     * 실시간 통계를 유지하기 위해 응답 시간이 추가될 때마다 호출됨
     *
     * Percentile significance
     * - 50th (Median): Represents typical performance
     * - 75th: Upper quartile, indicates degraded performance start
     * - 95th: represents near-worst case
     * - 99th: Critical threshold for identifying severe outliers
     *
     * 백분위수 중요도
     * - 50번째(중앙값): 일반적인 성능
     * - 75번째: 상위 사분위수, 성능 저하 시작점
     * - 95번째: 최악의 경우에 가까운 상황
     * - 99번째: 심각한 이상값을 식별하기 위한 임계값
     */
    public synchronized void calculatePercentiles() {
        if (responseTimes.isEmpty()) {
            return;
        }

        List<Long> sortedTimes = new ArrayList<>(responseTimes);
        Collections.sort(sortedTimes);

        // Calculate key percentiles
        int[] percentiles = {50, 75, 95, 99};
        for (int p : percentiles) {
            double percentile = calculatePercentile(sortedTimes, p);
            responseTimePercentiles.put(p, percentile);
        }
    }

    /**
     * Calculates a specific percentile value using linear interpolation.
     * 선형 보간법을 사용하여 특정 백분위수 값을 계산.
     *
     * 선형 보간법(linear interpolation): value = lowerValue + (upperValue - lowerValue) * fraction
     * This provides more accurate percentile values than simple rounding.
     *
     * @param sortedData Pre-sorted response time data
     * @param percentile Target percentile (0-100)
     * @return Interpolated percentile value
     */
    private double calculatePercentile(List<Long> sortedData, int percentile) {
        if (sortedData.isEmpty()) {
            return 0.0;
        }

        // Calculate the index corresponding to the percentile
        double index = (percentile / 100.0) * (sortedData.size() - 1);
        int lowerIndex = (int) Math.floor(index);
        int upperIndex = (int) Math.ceil(index);

        // When it corresponds exactly to an index
        if (lowerIndex == upperIndex) {
            return sortedData.get(lowerIndex);
        }

        // Calculate the exact percentile value using linear interpolation
        double lowerValue = sortedData.get(lowerIndex);
        double upperValue = sortedData.get(upperIndex);
        double fraction = index - lowerIndex;

        return lowerValue + (upperValue - lowerValue) * fraction;
    }

    /**
     * Add response time and update the percentile
     * 응답시간을 추가하고 퍼센타일을 업데이트
     */
    public void addResponseTime(long responseTime) {
        synchronized (lock) {
            calculatePercentiles();

            this.latestResponseTime = responseTime;
            responseTimes.add(responseTime);
            this.maxResponseTime = Math.max(this.maxResponseTime, responseTime);
            this.minResponseTime = this.minResponseTime == 0 ? responseTime
                : Math.min(this.minResponseTime, responseTime);
            this.averageResponseTime = this.responseTimes.stream()
                .mapToLong(Long::valueOf)
                .average()
                .orElse(0.0);
        }
    }

    /**
     * Get response time at a specific percentile.
     * 특정 퍼센타일의 응답시간을 가져옴
     *
     * @param percentile 원하는 퍼센타일 (0-100)
     * @return The response time at the specified percentile; returns 0.0 if no data is available.
     */
    public double getPercentileResponseTime(int percentile) {
        return responseTimePercentiles.getOrDefault(percentile, 0.0);
    }
}