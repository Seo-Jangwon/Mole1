/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.controller;

import com.monitor.annotation.dto.MemoryMetrics;
import com.monitor.annotation.dto.TestResult;
import com.monitor.annotation.dto.ThreadMetrics;
import com.monitor.annotation.service.MemoryMonitorService;
import com.monitor.annotation.service.PerformanceTestService;
import com.monitor.annotation.service.ThreadMonitorService;
import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/performanceMeasure/metrics")
@RequiredArgsConstructor
@Slf4j
public class MetricsController {

    private final MemoryMonitorService memoryMonitorService;
    private final PerformanceTestService performanceTestService;
    private final ThreadMonitorService threadMonitorService;
    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();

    @Qualifier("taskScheduler")
    private final TaskScheduler taskScheduler;

    @GetMapping(path = "/stream/{testId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamMetrics(@PathVariable String testId) {
        // log.info("SSE Stream requested for test: {}", testId);
        SseEmitter emitter = new SseEmitter(180_000L); // 3분 타임아웃

        try {
            // 이전 emitter가 있다면 정리
            removeEmitter(testId);

            emitters.put(testId, emitter);
            // log.info("Started metrics stream for test: {}", testId);

            // 비동기로 메트릭 전송 시작
            startMetricsEmission(testId, emitter);

            // 완료, 타임아웃, 에러 처리
            emitter.onCompletion(() -> {
                // log.info("Metrics stream completed for test: {}", testId);
                removeEmitter(testId);
            });

            emitter.onTimeout(() -> {
                // log.warn("Metrics stream timed out for test: {}", testId);
                removeEmitter(testId);
            });

            emitter.onError(ex -> {
                 log.error("Error in metrics stream for test: {}", testId, ex);
                removeEmitter(testId);
            });

        } catch (Exception e) {
            // log.error("Error creating metrics stream for test: {}", testId, e);
            emitter.completeWithError(e);
        }

        return emitter;
    }

    private void removeEmitter(String testId) {
        // 스케줄된 태스크 취소
        ScheduledFuture<?> task = scheduledTasks.remove(testId);
        if (task != null) {
            task.cancel(true);
        }

        SseEmitter oldEmitter = emitters.remove(testId);
        if (oldEmitter != null) {
            try {
                oldEmitter.complete();
            } catch (Exception e) {
                // log.warn("Error completing old emitter for test: {}", testId, e);
            }
        }
    }

    private void startMetricsEmission(String testId, SseEmitter emitter) {
        // log.info("Starting metrics emission for test: {}", testId);
        ScheduledFuture<?> task = taskScheduler.scheduleWithFixedDelay(() -> {
            try {
                TestResult testResult = performanceTestService.getTestStatus(testId);
                if (testResult == null) {
                    // log.warn("No test result found for test: {}", testId);
                    removeEmitter(testId);
                    return;
                }

                // log.debug("Creating metrics message for test: {}, status: {}", testId,
                // testResult.getStatus());
                MetricsMessage message = createMetricsMessage(testResult);
                emitter.send(message);
                // log.debug("Sent metrics message for test: {}", testId);

                if (testResult.isCompleted()) {
                     log.info("Test completed, closing stream for test: {}", testId);
                    removeEmitter(testId);
                }
            } catch (Exception e) {
                // log.error("Error sending metrics for test: {}", testId, e);
                removeEmitter(testId);
            }
        }, Duration.ofSeconds(1));

        scheduledTasks.put(testId, task);
    }

    @GetMapping("/analysis/{testId}")
    public ResponseEntity<Map<String, Object>> getAnalytics(@PathVariable String testId) {
        // log.info("Fetching analytics for test: {}", testId);

        TestResult testResult = performanceTestService.getTestStatus(testId);
        if (testResult == null) {
            // log.warn("No test result found for test: {}", testId);
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> analytics = new HashMap<>();

        // Response Time Distribution - 퍼센타일 정보
        analytics.put("percentiles", Map.of(
            "p50", testResult.getPercentileResponseTime(50),
            "p75", testResult.getPercentileResponseTime(75),
            "p95", testResult.getPercentileResponseTime(95),
            "p99", testResult.getPercentileResponseTime(99)
        ));

        // 응답 시간 통계 계산
        if (testResult.getResponseTimes() != null && !testResult.getResponseTimes().isEmpty()) {
            List<Long> times = testResult.getResponseTimes();
            double mean = times.stream().mapToLong(Long::valueOf).average().orElse(0.0);
            double variance = times.stream()
                .mapToDouble(t -> Math.pow(t - mean, 2))
                .average()
                .orElse(0.0);
            double stdDev = Math.sqrt(variance);

            analytics.put("statistics", Map.of(
                "standardDeviation", stdDev,
                "mean", mean,
                "min", Collections.min(times),
                "max", Collections.max(times)
            ));

            // 이상치(outlier) 계산 (평균에서 2 표준편차 이상 벗어난 응답)
            long outliers = times.stream()
                .filter(t -> Math.abs(t - mean) > 2 * stdDev)
                .count();
            analytics.put("outliers", outliers);

            // 변동 계수(CV) 계산
            double cv = (stdDev / mean) * 100;
            analytics.put("coefficientOfVariation", cv);

            // 안정성 점수 계산
            int stabilityScore = calculateStabilityScore(cv, outliers, times.size());
            analytics.put("stabilityScore", stabilityScore);
        }

        return ResponseEntity.ok(analytics);
    }

    /**
     * Calculates overall stability score based on performance metrics. 성능 메트릭을 기반으로 전체 안정성 점수를 계산
     * <p>
     * Scoring criteria 1. CV (Coefficient of Variation) - 60% weight - Measures consistency of
     * response times - Scale: 0-50% CV is ideal (100-0 points) - Why 60% weight: Primary indicator
     * of performance stability
     * <p>
     * 2. Outlier Ratio - 40% weight - Measures frequency of anomalous responses - Scale: 0-20%
     * outliers (100-0 points) - Why 40% weight: Secondary indicator, supplements CV
     * <p>
     * Weighting rationale - CV is weighted higher (60%) as it reflects overall consistency -
     * Outlier ratio (40%) captures extreme cases while avoiding over-penalization
     * <p>
     * Target thresholds - Excellent: 80-100 (low variation, few outliers) - Good: 60-79 (moderate
     * variation, acceptable outliers) - Poor: <60 (high variation, too many outliers)
     *
     * @param cv           Coefficient of Variation percentage
     * @param outliers     Number of outlier responses
     * @param totalSamples Total number of responses
     * @return Stability score from 0 to 100
     */
    private int calculateStabilityScore(double cv, long outliers, int totalSamples) {
        // CV 점수 계산 - CV가 50% 이상이면 0점
        double cvScore = Math.max(0, 100 - (cv * 2));

        // 이상치 점수 계산 - 이상치가 전체의 20% 이상이면 0점
        double outlierScore = Math.max(0, 100 - (outliers * 100.0 / totalSamples) * 5);

        // 가중치 적용 (CV: 60%, Outliers: 40%)
        return (int) Math.round((cvScore * 0.6) + (outlierScore * 0.4));
    }

    private MetricsMessage createMetricsMessage(TestResult testResult) {
        // log.info("Creating metrics message for test: {}, status: {}",
        // testResult.getTestId(), testResult.getStatus());

        MemoryMetrics metrics = memoryMonitorService.collectMetrics();
        testResult.addMemoryMetric(metrics);

        ThreadMetrics threadMetrics = null;
        if (!testResult.isCompleted()) {
            threadMetrics = threadMonitorService.getMethodMetrics(
                testResult.getClassName(),
                testResult.getMethodName()
            );
            testResult.updateThreadMetrics(threadMetrics);
        }

        TestStatus status;
        switch (testResult.getStatus()) {
            case "START_TEST":
                status = TestStatus.START_TEST;
                break;
            case "STOP_TEST":
                status = TestStatus.STOP_TEST;
                break;
            default:
                status = testResult.isCompleted() ? TestStatus.COMPLETED : TestStatus.RUNNING;
        }

        // Collect percentile information
        Map<String, Double> percentiles = new HashMap<>();
        percentiles.put("p50", testResult.getPercentileResponseTime(50));
        percentiles.put("p75", testResult.getPercentileResponseTime(75));
        percentiles.put("p95", testResult.getPercentileResponseTime(95));
        percentiles.put("p99", testResult.getPercentileResponseTime(99));

//         log.info("Determined TestStatus: {}, Percentiles: p95={}, p99={}",
//         status,
//            percentiles.get("p95"),
//            percentiles.get("p99"));

        return new MetricsMessage(status, testResult, threadMetrics, metrics, percentiles);
    }

    @Getter
    @AllArgsConstructor
    private static class MetricsMessage {

        private final TestStatus status;
        private final TestResult testStatus;
        private final ThreadMetrics threadMetrics;
        private final MemoryMetrics metrics;
        private final Map<String, Double> percentiles;
    }

    public enum TestStatus {
        RUNNING,
        START_TEST,
        STOP_TEST,
        COMPLETED
    }
}