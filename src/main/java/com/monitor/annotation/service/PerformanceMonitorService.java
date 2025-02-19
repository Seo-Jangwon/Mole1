/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.service;

import com.monitor.annotation.dto.PerformanceData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Service responsible for collecting and managing performance measurement data.
 * Stores and analyzes performance metrics for methods annotated with @PerformanceMeasure.
 * Provides functionality to detect performance bottlenecks and generate performance reports.
 */
@Slf4j
@Service
public class PerformanceMonitorService {

    private final Map<String, List<PerformanceData>> performanceDataMap = new ConcurrentHashMap<>();

    /**
     * Adds new performance measurement data to the monitoring system.
     * If execution time exceeds threshold (1000ms), logs a warning for potential bottleneck.
     *
     * @param data Performance measurement data to be added
     */
    public void addPerformanceData(PerformanceData data) {
        String key = data.getClassName() + "." + data.getMethodName();
        performanceDataMap.computeIfAbsent(key, k -> new ArrayList<>()).add(data);

        if (data.isSlowExecution()) {
            log.warn("Performance bottleneck detected in {}.{}: execution_time={}ms (threshold: 1000ms)",
                data.getClassName(), data.getMethodName(), data.getExecutionTime());
        }
    }

    /**
     * Retrieves all collected performance data, sorted by timestamp in descending order.
     *
     * @return List of all performance measurements
     */
    public List<PerformanceData> getAllPerformanceData() {
        return performanceDataMap.values().stream()
            .flatMap(List::stream)
            .sorted((a, b) -> b.getTimestamp().compareTo(a.getTimestamp()))
            .collect(Collectors.toList());
    }

    public Map<String, Double> getAverageExecutionTimes() { // 나중에 성능 모니터링 대시보드나 리포트 생성 시 사용
        return performanceDataMap.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                entry -> entry.getValue().stream()
                    .mapToLong(PerformanceData::getExecutionTime)
                    .average()
                    .orElse(0.0)
            ));
    }

    public List<PerformanceData> getBottlenecks() { // 나중에 성능 모니터링 대시보드나 리포트 생성 시 사용
        return getAllPerformanceData().stream()
            .filter(PerformanceData::isSlowExecution)
            .collect(Collectors.toList());
    }
}