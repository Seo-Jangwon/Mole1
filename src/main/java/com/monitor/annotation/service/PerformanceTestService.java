/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.service;

import com.monitor.annotation.dto.MemoryMetrics;
import com.monitor.annotation.dto.TestResult;
import com.monitor.annotation.dto.TestScenarioRequest;
import com.monitor.annotation.dto.ThreadMetrics;
import jakarta.annotation.PreDestroy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Core service for executing performance tests against REST endpoints. Provides functionality for:
 * - Concurrent load testing - Real-time metrics collection - Test progress monitoring - Result
 * aggregation and analysis
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PerformanceTestService {

    private final Object testLock = new Object();
    private volatile boolean testInProgress = false;
    private final RestTemplate restTemplate;
    private final MemoryMonitorService memoryMonitorService;
    private final ThreadMonitorService threadMonitorService;

    @Autowired
    @Qualifier("performanceTestExecutor")
    private ThreadPoolTaskExecutor performanceTestExecutor;

    private final Map<String, TestResult> testResults = new ConcurrentHashMap<>();           // save test results
    private final Map<String, List<MemoryMetrics>> activeTestMetrics = new ConcurrentHashMap<>();  // memory metrics of active test
    private final Map<String, AtomicBoolean> testCancellationFlags = new ConcurrentHashMap<>();

    /**
     * Collect memory metrics of active tests periodically. Execute every 1 second. Collect memory
     * metrics for all currently running tests.
     */
    @Scheduled(fixedRate = 1000)
    public void collectMetricsForActiveTests() {
        if (!activeTestMetrics.isEmpty()) {
            MemoryMetrics currentMetrics = memoryMonitorService.collectMetrics();
            activeTestMetrics.forEach((testId, metricsList) -> metricsList.add(currentMetrics));
        }
    }

    /**
     * start collecting metrics for new tests
     *
     * @param testId test ID
     */
    private void startMetricsCollection(String testId) {
        activeTestMetrics.put(testId, Collections.synchronizedList(new ArrayList<>()));
    }

    /**
     * stop collecting test metrics and return collected metrics
     *
     * @param testId test ID
     * @return collected memory metrics list
     */
    private List<MemoryMetrics> stopMetricsCollection(String testId) {
        return activeTestMetrics.remove(testId);
    }

    /**
     * Initiates a new performance test based on the provided configuration. Ensures only one test
     * runs at a time and manages test lifecycle.
     *
     * @param request Test configuration including endpoint, concurrency, and other parameters
     * @return Unique test ID for tracking the test
     * @throws IllegalStateException if another test is already running
     */
    public String startNewTest(TestScenarioRequest request) {
        synchronized (testLock) {
            if (testInProgress) {
                throw new IllegalStateException(
                    "Another test is already in progress. Please wait for it to complete.");
            }
            testInProgress = true;
        }
        try {
            String testId = UUID.randomUUID().toString();
            testCancellationFlags.put(testId,
                new AtomicBoolean(false)); // initialize test cancel flag
            startMetricsCollection(testId);

            log.info("Starting new test with ID: {}", testId);

            TestResult initialResult = TestResult.builder()
                .testId(testId)
                .description(request.getDescription())
                .url(request.getUrl())
                .method(request.getMethod())
                .className(this.getClass().getSimpleName())
                .methodName("runTest")
                .completed(false)
                .startTime(LocalDateTime.now())
                .status("RUNNING")
                .build();

            testResults.put(testId, initialResult);
//            log.info("Created initial result: {}", initialResult);

            performanceTestExecutor.submit(() -> runTest(testId, request));

            return testId;

        } catch (Exception e) {
            testInProgress = false;
            throw e;
        }
    }


    /**
     * Retrieves current test status and results.
     *
     * @param testId Test identifier
     * @return Current test status and metrics
     */
    public TestResult getTestStatus(String testId) {
        return testResults.get(testId);
    }

    /**
     * Retrieves all historical test results.
     *
     * @return List of all test results
     */
    public List<TestResult> getAllTestResults() {
        return new ArrayList<>(testResults.values());
    }

    /**
     * Safely shuts down the thread pool upon application exit to prevent resource leaks.
     */
    @PreDestroy
    public void shutdown() {
        performanceTestExecutor.shutdown();
    }

    /**
     * Executes the actual performance test with specified parameters. Manages concurrent requests,
     * collects metrics, and updates test progress.
     *
     * @param testId  Unique identifier for the test
     * @param request Test configuration parameters
     */
    private void runTest(String testId, TestScenarioRequest request) {
        ThreadMetrics threadMetrics = null;
        try {
            threadMetrics = threadMonitorService.startMethodMonitoring(
                this.getClass().getSimpleName(),
                "runTest"
            );

            List<Long> responseTimes = Collections.synchronizedList(new ArrayList<>());
            CountDownLatch latch = new CountDownLatch(
                request.getConcurrentUsers() * request.getRepeatCount());
            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger failureCount = new AtomicInteger(0);

            HttpHeaders headers = prepareHeaders(request, testId);
            HttpEntity<?> requestEntity = createRequestEntity(request, headers);

            executeTestRequests(request, latch, responseTimes, successCount, failureCount,
                requestEntity, testId);

            if (!waitForTestCompletion(testId, request, latch)) {
                return;
            }

            updateFinalResults(testId, request, responseTimes, successCount.get(),
                failureCount.get());

        } catch (Exception e) {
            log.error("Test {} failed: {}", testId, e.getMessage(), e);
            handleTestError(testId, e);
        } finally {
            if (threadMetrics != null) {
                threadMonitorService.stopMethodMonitoring(
                    this.getClass().getSimpleName(),
                    "runTest"
                );
            }
        }
    }

    /**
     * Prepare HTTP request header
     */
    private HttpHeaders prepareHeaders(TestScenarioRequest request, String testId) {
        HttpHeaders headers = new HttpHeaders();
        request.getHeaders().forEach(headers::add);
        headers.add("X-Test-ID", testId);
        return headers;
    }

    /**
     * Generate HTTP request Entity
     */
    private HttpEntity<?> createRequestEntity(TestScenarioRequest request, HttpHeaders headers) {
        if (request.getRequestBody() != null && !request.getRequestBody().isEmpty()) {
            headers.setContentType(MediaType.APPLICATION_JSON);
            return new HttpEntity<>(request.getRequestBody(), headers);
        }
        return new HttpEntity<>(headers);
    }

    /**
     * Executes the test request
     */
    private void executeTestRequests(TestScenarioRequest request, CountDownLatch latch,
        List<Long> responseTimes, AtomicInteger successCount, AtomicInteger failureCount,
        HttpEntity<?> requestEntity, String testId) {

        for (int i = 0; i < request.getConcurrentUsers(); i++) {
            int userId = i;
            performanceTestExecutor.submit(() -> {
                try {
                    if (request.getRampUpSeconds() > 0) {
                        Thread.sleep(calculateRampUpDelay(userId, request.getRampUpSeconds(),
                            request.getConcurrentUsers()));
                    }
                    executeUserRequests(request, latch, responseTimes, successCount, failureCount,
                        requestEntity, testId);
                } catch (Exception e) {
//                    log.error("User thread execution failed: {}", e.getMessage(), e);
                    handleFailedRequests(request.getRepeatCount(), failureCount, latch);
                }
            });
        }
    }

    /**
     * Handles failed requests
     */
    private void handleFailedRequests(int remainingRequests, AtomicInteger failureCount,
        CountDownLatch latch) {
        for (int j = 0; j < remainingRequests; j++) {
            failureCount.incrementAndGet();
            latch.countDown();
        }
    }

    /**
     * Waits for the test to complete
     *
     * @return Whether the completion was successful
     */
    private boolean waitForTestCompletion(String testId, TestScenarioRequest request,
        CountDownLatch latch) {
        try {
            if (!latch.await(request.getTimeoutSeconds(), TimeUnit.SECONDS)) {
                handleTestTimeout(testId);
                return false;
            }
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            handleTestError(testId, e);
            return false;
        }
    }

    /**
     * Executes repeated requests from a single user
     */
    private void executeUserRequests(TestScenarioRequest request, CountDownLatch latch,
        List<Long> responseTimes, AtomicInteger successCount, AtomicInteger failureCount,
        HttpEntity<?> requestEntity, String testId) {

        AtomicBoolean cancellationFlag = testCancellationFlags.get(testId);

        for (int j = 0; j < request.getRepeatCount(); j++) {
            if (cancellationFlag.get()) {  // check test cancel request
                latch.countDown();
                break;
            }
            try {
                executeRequest(request, responseTimes, successCount, failureCount, requestEntity,
                    testId);
            } catch (Exception e) {

//                log.error("Request failed: {}", e.getMessage());
                failureCount.incrementAndGet();
            } finally {
                latch.countDown();
            }
        }
    }

    /**
     * Executes repeated requests from a single user
     */
    private void executeRequest(TestScenarioRequest request, List<Long> responseTimes,
        AtomicInteger successCount, AtomicInteger failureCount, HttpEntity<?> requestEntity,
        String testId) {

        AtomicBoolean cancellationFlag = testCancellationFlags.get(testId);
        if (cancellationFlag != null && cancellationFlag.get()) {
            return;
        }

        long startTime = System.nanoTime();
        ResponseEntity<?> response = restTemplate.exchange(
            request.getUrl(),
            HttpMethod.valueOf(request.getMethod()),
            requestEntity,
            String.class
        );
        long responseTime = (System.nanoTime() - startTime) / 1_000_000;

        if (cancellationFlag != null && cancellationFlag.get()) {
            return;
        }

        responseTimes.add(responseTime);
        TestResult currentResult = testResults.get(testId);

        if (currentResult != null) {
            currentResult.addResponseTime(responseTime);

            if (response.getStatusCode().is2xxSuccessful()) {
                successCount.incrementAndGet();
            } else {
                failureCount.incrementAndGet();
            }

            // Updates the real-time progress
            currentResult.updateProgress(
                successCount.get() + failureCount.get(),
                successCount.get(),
                failureCount.get()
            );
        }


    }

    private long calculateRampUpDelay(int userIndex, int rampUpSeconds, int totalUsers) {
        return (long) (((double) userIndex / totalUsers) * rampUpSeconds * 1000);
    }

    /**
     * handle timeout
     */
    private void handleTestTimeout(String testId) {
        log.error("Test {} timed out", testId);
//        log.debug("Current test progress state: {}", testInProgress);

        try {
            AtomicBoolean cancellationFlag = testCancellationFlags.get(testId);
            if (cancellationFlag != null) {
                cancellationFlag.set(true);
            }

            TestResult currentResult = testResults.get(testId);
            if (currentResult != null) {
                List<MemoryMetrics> metrics = stopMetricsCollection(testId);
                TestResult timeoutResult = TestResult.builder()
                    .testId(testId)
                    .description(currentResult.getDescription())
                    .url(currentResult.getUrl())
                    .method(currentResult.getMethod())
                    .completed(true)
                    .startTime(currentResult.getStartTime())
                    .endTime(LocalDateTime.now())
                    .totalRequests(0)
                    .successfulRequests(0)
                    .failedRequests(0)
                    .errorRate(100.0)
                    .status("TIMEOUT")
                    .build();

                if (metrics != null) {
                    metrics.forEach(timeoutResult::addMemoryMetric);
                }

                testResults.put(testId, timeoutResult);
            }
        } finally {
            synchronized (testLock) {
                testInProgress = false;
            }
            performanceTestExecutor.shutdown();
            initializeExecutor();
        }
    }

    private void initializeExecutor() {
        performanceTestExecutor = new ThreadPoolTaskExecutor();
        performanceTestExecutor.setCorePoolSize(10);
        performanceTestExecutor.setMaxPoolSize(50);
        performanceTestExecutor.setQueueCapacity(100);
        performanceTestExecutor.setThreadNamePrefix("PerfTest-");
        performanceTestExecutor.setKeepAliveSeconds(60);
        performanceTestExecutor.initialize();
    }

    /**
     * handle test error
     */
    private void handleTestError(String testId, Exception e) {
        List<MemoryMetrics> metrics = stopMetricsCollection(testId);
        TestResult errorResult = TestResult.builder()
            .testId(testId)
            .description(testResults.get(testId).getDescription())
            .status("ERROR")
            .errorMessage(e.getMessage())
            .completed(true)
            .build();

        if (metrics != null) {
            metrics.forEach(errorResult::addMemoryMetric);
        }

        testResults.put(testId, errorResult);
    }

    /**
     * update test results (final)
     */
    private void updateFinalResults(String testId, TestScenarioRequest request,
        List<Long> responseTimes, int successCount, int failureCount) {
        try {
            List<MemoryMetrics> metrics = stopMetricsCollection(testId);
            LocalDateTime endTime = LocalDateTime.now();
            TestResult currentResult = testResults.get(testId);

            double totalSeconds = java.time.Duration.between(currentResult.getStartTime(), endTime)
                .toMillis() / 1000.0;

            TestResult finalResult = TestResult.builder()
                .testId(testId)
                .description(request.getDescription())
                .url(request.getUrl())
                .method(request.getMethod())
                .className(this.getClass().getSimpleName())
                .methodName("runTest")
                .completed(true)
                .startTime(currentResult.getStartTime())
                .endTime(endTime)
                .totalRequests(successCount + failureCount)
                .successfulRequests(successCount)
                .failedRequests(failureCount)
                .averageResponseTime(calculateAverageResponseTime(responseTimes))
                .maxResponseTime(calculateMaxResponseTime(responseTimes))
                .minResponseTime(calculateMinResponseTime(responseTimes))
                .requestsPerSecond((successCount + failureCount) / totalSeconds)
                .errorRate(calculateErrorRate(successCount, failureCount))
                .status("COMPLETED")
                .build();

            // 응답 시간 데이터 추가 및 퍼센타일 계산
            responseTimes.forEach(finalResult::addResponseTime);

            // 메모리 메트릭 추가
            if (metrics != null) {
                metrics.forEach(finalResult::addMemoryMetric);
            }

            // 결과 저장
            testResults.put(testId, finalResult);

            log.info("Test {} completed. Final results: p95={}, p99={}, avg={}, max={}, rps={}",
                testId,
                finalResult.getPercentileResponseTime(95),
                finalResult.getPercentileResponseTime(99),
                finalResult.getAverageResponseTime(),
                finalResult.getMaxResponseTime(),
                finalResult.getRequestsPerSecond());

        } finally {
            testInProgress = false;
            testCancellationFlags.remove(testId);
        }
    }

    private double calculateAverageResponseTime(List<Long> responseTimes) {
        return responseTimes.stream()
            .mapToLong(Long::valueOf)
            .average()
            .orElse(0.0);
    }

    private double calculateMaxResponseTime(List<Long> responseTimes) {
        return responseTimes.stream()
            .mapToLong(Long::valueOf)
            .max()
            .orElse(0);
    }

    private double calculateMinResponseTime(List<Long> responseTimes) {
        return responseTimes.stream()
            .mapToLong(Long::valueOf)
            .min()
            .orElse(0);
    }

    private double calculateErrorRate(int successCount, int failureCount) {
        return failureCount * 100.0 / (successCount + failureCount);
    }

    /**
     * Stops a running performance test and updates its final status. Handles the following cleanup
     * tasks - Sets cancellation flag to stop new request executions - Stops memory metrics
     * collection - Cleans up thread monitoring - Updates test result status and metrics
     *
     * @param testId The identifier of the test to stop
     */
    public void stopTest(String testId) {
        TestResult result = testResults.get(testId);
        if (result != null) {
            // set cancel flag
            AtomicBoolean cancellationFlag = testCancellationFlags.get(testId);
            if (cancellationFlag != null) {
                cancellationFlag.set(true);
            }

            // Stop collecting memory metrics and clean up
            List<MemoryMetrics> metrics = stopMetricsCollection(testId);
            if (metrics != null) {
                metrics.forEach(result::addMemoryMetric);
            }

            // Clean up monitoring of running threads
            threadMonitorService.stopMethodMonitoring(
                result.getClassName(),
                result.getMethodName()
            );

            // Update the status of test results
            result.setStatus("STOP_TEST");
            result.setCompleted(true);
            result.setEndTime(LocalDateTime.now());

            // Clean up test execution status flags
            synchronized (testLock) {
                testInProgress = false;
            }

            // Calculate and update final metrics
            if (result.getStartTime() != null) {
                double totalSeconds = java.time.Duration
                    .between(result.getStartTime(), result.getEndTime())
                    .toMillis() / 1000.0;
                result.setRequestsPerSecond(
                    totalSeconds > 0 ? result.getTotalRequests() / totalSeconds : 0
                );
            }
        }
    }
}