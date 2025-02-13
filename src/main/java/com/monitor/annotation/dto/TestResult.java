/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.ArrayList;
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

    public void addResponseTime(long responseTime) {
        synchronized (lock) {
            this.latestResponseTime = responseTime;
            this.responseTimes.add(responseTime);
            this.maxResponseTime = Math.max(this.maxResponseTime, responseTime);
            this.minResponseTime = this.minResponseTime == 0 ? responseTime
                : Math.min(this.minResponseTime, responseTime);
            // 평균 응답시간도 업데이트
            this.averageResponseTime = this.responseTimes.stream()
                .mapToLong(Long::valueOf)
                .average()
                .orElse(0.0);
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
}