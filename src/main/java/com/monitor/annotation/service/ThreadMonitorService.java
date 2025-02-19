/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.service;

import com.monitor.annotation.dto.ThreadMetrics;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Service for monitoring thread behavior and collecting thread metrics.
 * Provides comprehensive thread monitoring capabilities including:
 * - Thread lifecycle management
 * - CPU time tracking
 * - Thread pool statistics
 * - Parent-child thread relationship tracking
 */
@Slf4j
@Service
public class ThreadMonitorService {

    private final ThreadMXBean threadMXBean;
    private final ThreadPoolTaskExecutor performanceExecutor;
    private final Map<String, ThreadMetrics> methodMetrics = new ConcurrentHashMap<>();
    private final Map<Long, String> threadToMethod = new ConcurrentHashMap<>();

    public ThreadMonitorService(
        @Qualifier("performanceTestExecutor") ThreadPoolTaskExecutor performanceExecutor) {
        this.threadMXBean = ManagementFactory.getThreadMXBean();
        this.performanceExecutor = performanceExecutor;
    }

    /**
     * Initializes thread monitoring features and configures MXBean settings.
     */
    @PostConstruct
    public void init() {
        threadMXBean.setThreadCpuTimeEnabled(true);
        threadMXBean.setThreadContentionMonitoringEnabled(true);
    }

    /**
     * Starts monitoring a method's thread execution.
     * Creates initial thread metrics and establishes monitoring context.
     *
     * @param className The class containing the method
     * @param methodName The method to monitor
     * @return Initial thread metrics
     */
    public ThreadMetrics startMethodMonitoring(String className, String methodName) {
        String key = className + "." + methodName;
        Thread currentThread = Thread.currentThread();
        long threadId = currentThread.getId();

        ThreadMetrics metrics = ThreadMetrics.builder()
            .type(ThreadMetrics.MetricType.METHOD)
            .className(className)
            .methodName(methodName)
            .threadId(threadId)
            .threadName(currentThread.getName())
            .threadState(currentThread.getState())
            .isDaemon(currentThread.isDaemon())
            .priority(currentThread.getPriority())
            .stackTrace(currentThread.getStackTrace())
            .childThreads(new ConcurrentHashMap<>())
            .build();

        updateMetrics(metrics);
        methodMetrics.put(key, metrics);
        threadToMethod.put(threadId, key);

        return metrics;
    }

    /**
     * Updates thread metrics for a specific method.
     * Collects current thread states, CPU times, and pool statistics.
     *
     * @param className The class containing the method
     * @param methodName The method being monitored
     */
    public void updateMethodMetrics(String className, String methodName) {
        String key = className + "." + methodName;
        ThreadMetrics metrics = methodMetrics.get(key);

        if (metrics != null) {
            updateMetrics(metrics);
//            log.debug("Updated method metrics for {}: active={}, pool={}, queue={}, completed={}",
//                key, metrics.getActivePoolThreads(), metrics.getPoolSize(),
//                metrics.getQueuedTasks(), metrics.getCompletedTasks());
        }
    }

    private void updateMetrics(ThreadMetrics metrics) {
        if (metrics == null) {
            return;
        }

        updateThreadStates(metrics);
        updateCpuTimes(metrics);
        updateThreadPoolMetrics(metrics);
    }

    private void updateThreadPoolMetrics(ThreadMetrics metrics) {
        if (!"PerformanceTestService".equals(metrics.getClassName())) {
            return;  // 성능 테스트 서비스의 메트릭만 업데이트
        }

        ThreadPoolExecutor executor = performanceExecutor.getThreadPoolExecutor();

        // 스레드 풀 기본 메트릭
        metrics.setActivePoolThreads(executor.getActiveCount());
        metrics.setPoolSize(executor.getPoolSize());
        metrics.setQueuedTasks((long) executor.getQueue().size());
        metrics.setCompletedTasks(executor.getCompletedTaskCount());

        // 스레드 상태 분석
        ThreadInfo[] threadInfos = threadMXBean.getThreadInfo(threadMXBean.getAllThreadIds());
        int waiting = 0;
        int blocked = 0;
        int running = executor.getActiveCount();

        // PerfTest- 접두사를 가진 스레드만 카운트
        for (ThreadInfo info : threadInfos) {
            if (info != null && info.getThreadName().startsWith("PerfTest-")) {
                switch (info.getThreadState()) {
                    case WAITING:
                    case TIMED_WAITING:
                        waiting++;
                        break;
                    case BLOCKED:
                        blocked++;
                        break;
                }
            }
        }

        metrics.setRunningThreadCount(running);
        metrics.setWaitingThreadCount(waiting);
        metrics.setBlockedThreadCount(blocked);

//        log.debug("Thread pool metrics updated - active: {}, pool: {}, queue: {}, completed: {}, " +
//                "running: {}, waiting: {}, blocked: {}",
//            metrics.getActivePoolThreads(), metrics.getPoolSize(),
//            metrics.getQueuedTasks(), metrics.getCompletedTasks(),
//            metrics.getRunningThreadCount(), metrics.getWaitingThreadCount(),
//            metrics.getBlockedThreadCount());
    }

    private void updateThreadStates(ThreadMetrics metrics) {
        if (metrics.getThreadId() <= 0) {
//            log.warn("Invalid thread ID in metrics: {}", metrics.getThreadId());
            return;
        }

        ThreadInfo threadInfo = threadMXBean.getThreadInfo(metrics.getThreadId());
        if (threadInfo != null) {
            metrics.setThreadState(threadInfo.getThreadState());
            if (metrics.getChildThreads() != null) {
                updateChildThreadStates(metrics);
            }
        }
    }

    private void updateChildThreadStates(ThreadMetrics metrics) {
        if (metrics.getChildThreads() != null) {
            for (ThreadMetrics childMetric : metrics.getChildThreads().values()) {
                ThreadInfo childInfo = threadMXBean.getThreadInfo(childMetric.getThreadId());
                if (childInfo != null) {
                    childMetric.setThreadState(childInfo.getThreadState());
                }
            }
        }
    }

    private void updateCpuTimes(ThreadMetrics metrics) {
        if (metrics.getThreadId() <= 0) {
            return;
        }

        try {
            // CPU 시간 측정 지원 여부 체크
            if (!threadMXBean.isThreadCpuTimeSupported() || !threadMXBean.isThreadCpuTimeEnabled()) {
                log.warn("Thread CPU time measurement not supported or not enabled");
                return;
            }

            long id = metrics.getThreadId();
            long cpuTime = threadMXBean.getThreadCpuTime(id);
            long userTime = threadMXBean.getThreadUserTime(id);

            // -1은 스레드가 존재하지 않거나 죽은 경우
            if (cpuTime != -1) {
                metrics.setThreadCpuTime(cpuTime);
            }
            if (userTime != -1) {
                metrics.setThreadUserTime(userTime);
            }

            if (metrics.getChildThreads() != null) {

                updateChildThreadCpuTimes(metrics);
            }
        } catch (Exception e) {
            log.error("Error updating CPU times: {}", e.getMessage(), e);
        }
    }

    private void updateChildThreadCpuTimes(ThreadMetrics metrics) {
        if (metrics.getChildThreads() == null) {
            return;
        }

        for (ThreadMetrics childMetric : metrics.getChildThreads().values()) {
            if (childMetric.getThreadId() > 0) {
                long childId = childMetric.getThreadId();
                long cpuTime = threadMXBean.getThreadCpuTime(childId);
                long userTime = threadMXBean.getThreadUserTime(childId);

                if (cpuTime != -1) {
                    childMetric.setThreadCpuTime(cpuTime);
                }
                if (userTime != -1) {
                    childMetric.setThreadUserTime(userTime);
                }
            }
        }
    }

    /**
     * Retrieves the current metrics for a method.
     * Returns the last known metrics if the method is no longer being monitored.
     *
     * @param className The class containing the method
     * @param methodName The method name
     * @return Current or last known thread metrics
     */
    public ThreadMetrics getMethodMetrics(String className, String methodName) {
        String key = className + "." + methodName;
        ThreadMetrics metrics = methodMetrics.get(key);
        if (metrics == null) {
            // 활성 메트릭이 없으면 마지막 저장된 메트릭 반환
            metrics = lastMetrics.get(key);
        }
        if (metrics != null) {
            updateMetrics(metrics);
        }
        return metrics;
    }

    private final Map<String, ThreadMetrics> lastMetrics = new ConcurrentHashMap<>();

    /**
     * Stops monitoring a method's thread execution.
     * Saves final metrics and cleans up monitoring resources.
     *
     * @param className The class containing the method
     * @param methodName The method being monitored
     */
    public void stopMethodMonitoring(String className, String methodName) {
        String key = className + "." + methodName;
        ThreadMetrics metrics = methodMetrics.get(key);
        if (metrics != null) {
            // 마지막 상태 저장
            lastMetrics.put(key, metrics.clone());

            methodMetrics.remove(key);
            threadToMethod.remove(metrics.getThreadId());
            if (metrics.getChildThreads() != null) {
                metrics.getChildThreads().keySet()
                    .forEach(threadToMethod::remove);
            }
        }
    }

    /**
     * Registers a child thread with its parent thread for monitoring.
     * Enables tracking of thread hierarchies in complex operations.
     *
     * @param parentThreadId ID of the parent thread
     * @param childThread The child thread to register
     */
    public void registerChildThread(long parentThreadId, Thread childThread) {
        String methodKey = threadToMethod.get(parentThreadId);
        if (methodKey != null) {
            ThreadMetrics parentMetrics = methodMetrics.get(methodKey);
            if (parentMetrics != null) {
                ThreadMetrics childMetrics = ThreadMetrics.builder()
                    .type(ThreadMetrics.MetricType.CHILD_THREAD)
                    .threadId(childThread.getId())
                    .threadName(childThread.getName())
                    .parentThreadId(parentThreadId)
                    .isDaemon(childThread.isDaemon())
                    .priority(childThread.getPriority())
                    .threadState(childThread.getState())
                    .childThreads(new ConcurrentHashMap<>())
                    .build();

                parentMetrics.addChildThread(childMetrics);
                threadToMethod.put(childThread.getId(), methodKey);

//                log.debug("Registered child thread: {} (ID: {}) for parent thread: {} (ID: {})",
//                    childThread.getName(), childThread.getId(),
//                    Thread.currentThread().getName(), parentThreadId);
            }
        }
    }
}