/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

import {chartService} from '../core/ChartService.js';
import {metricsService} from '../core/MetricsSSEService.js';
import {analyticsService} from '../core/AnalyticsService.js';
import {
  formatBytes,
  formatDuration,
  calculateDuration,
  formatNumber, getBadgeClass
} from '../utils/formatters.js';

/**
 * Manages the display and monitoring of performance test details.
 * Handles real-time metrics updates, historical data processing, and chart visualization.
 * 성능 테스트 상세 정보 표시와 모니터링 관리
 * 실시간 메트릭 업데이트, 과거 데이터 처리, 차트 시각화 처리
 */
class TestDetailsManager {

  /**
   * Initializes TestDetailsManager with state tracking variables.
   * 상태 추적 변수로 TestDetailsManager 초기화
   */
  constructor() {
    this.currentTestId = null;
    this.modalInstance = null;
    this.metricsSubscription = null;
    this.testResults = new Map();
    this.isChartInitialized = false;
    this.testState = new Map();
    this.metricsHistory = new Map(); // Map<testId, Array<{metrics, testStatus, threadMetrics}>>
  }

  /**
   * Retrieves test state for specified test ID.
   * 지정된 테스트 ID에 대한 테스트 상태 조회
   * @param {string} testId - Test identifier
   * @returns {Object} Test state
   */
  getTestState(testId) {
    if (!this.testState.has(testId)) {
      this.testState.set(testId, {
        processedDataPoints: new Set(),
        chartData: {
          labels: [],
          memoryData: [],
          threadData: [],
          responseTimeData: []
        }
      });
    }
    return this.testState.get(testId);
  }

  /**
   * Displays test details for a specific test ID.
   * Handles both completed tests (historical data) and ongoing tests (real-time monitoring).
   * 특정 테스트 ID에 대한 테스트 상세 정보 표시
   * 완료된 테스트(과거 데이터), 진행 중인 테스트(실시간 모니터링) 모두 처리
   *
   * @param {string} testId - Unique identifier for the test
   */
  async showDetails(testId) {
    try {
      if (this.currentTestId === testId) {
        return;
      }

      // Cleanup previous chart
      chartService.destroyCharts();
      this.isChartInitialized = false;

      this.currentTestId = testId;
      const data = await this.fetchTestData(testId);
      const testState = this.getTestState(testId);

      await this.initializeModal();
      await this.initializeCharts();

      // Separate processing of completed and live tests
      if (data.completed) {
        console.log('[TestDetails] Processing historical data');
        // Set all history data at once
        await this.processHistoricalData(data);
      } else {
        console.log('[TestDetails] Setting up real-time monitoring');
        // Real-time monitoring starts with a blank chart
        testState.processedDataPoints.clear(); // Initialize processed data points
        this.setupRealtimeMonitoring(data, testState);
      }
    } catch (error) {
      console.error('[TestDetails] Error showing details:', error);
    }
  }

  /**
   * Fetches test data from server.
   * 서버에서 테스트 데이터 조회
   * @param {string} testId - Test identifier
   * @returns {Promise<Object>} Test data
   */
  async fetchTestData(testId) {
    const response = await fetch(`/performanceMeasure/status/${testId}`);
    if (!response.ok) {
      throw new Error('Failed to load test data');
    }
    const data = await response.json();
    this.testResults.set(testId, data);
    return data;
  }

  updateAdvancedAnalytics(data) {
    if (!this.isChartInitialized || !data) {
      return;
    }

    // Percentiles Update
    if (data.percentiles) {
      this.updateElement('modal-p50-response',
          `${formatNumber(data.percentiles.p50)} ms`);
      this.updateElement('modal-p75-response',
          `${formatNumber(data.percentiles.p75)} ms`);
      this.updateElement('modal-p95-response',
          `${formatNumber(data.percentiles.p95)} ms`);
      this.updateElement('modal-p99-response',
          `${formatNumber(data.percentiles.p99)} ms`);
    }

    // Response Time Statistics
    if (data.testStatus?.responseTimes?.length > 0) {
      const times = data.testStatus.responseTimes;

      // Calculate Standard Deviation
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0)
          / times.length;
      const stdDev = Math.sqrt(variance);

      // Calculate Coefficient of Variation (CV)
      const cv = (stdDev / mean) * 100;

      // Calculate Range
      const range = Math.max(...times) - Math.min(...times);

      // Count Outliers (values more than 2 standard deviations from mean)
      const outliers = times.filter(
          t => Math.abs(t - mean) > 2 * stdDev).length;

      // Calculate Stability Score (100 - weighted sum of normalized metrics)
      const cvWeight = 0.4;
      const outlierWeight = 0.3;
      const rangeWeight = 0.3;

      const normalizedCV = Math.min(100, (cv / 50) * 100); // Normalize CV (50% CV = 100 points)
      const normalizedOutliers = (outliers / times.length) * 100;
      const normalizedRange = Math.min(100, (range / (mean * 3)) * 100);

      const stabilityScore = Math.max(0, Math.round(100 - (
          normalizedCV * cvWeight +
          normalizedOutliers * outlierWeight +
          normalizedRange * rangeWeight
      )));

      // Update UI with styling
      this.updateElement('modal-std-dev', `${formatNumber(stdDev)} ms`);
      this.updateElement('modal-cv', `${formatNumber(cv)}%`);
      this.updateElement('modal-rt-range', `${formatNumber(range)} ms`);
      this.updateElement('modal-outliers', outliers);

      // Update stability score with color coding
      const stabilityScoreElement = document.getElementById(
          'modal-stability-score');
      if (stabilityScoreElement) {
        stabilityScoreElement.textContent = String(stabilityScore);
        stabilityScoreElement.className = 'stability-score ' +
            (stabilityScore >= 80 ? 'stability-score-high' :
                stabilityScore >= 60 ? 'stability-score-medium' :
                    'stability-score-low');
      }
    }
  }

  /**
   * Initializes Bootstrap modal for test details.
   * 테스트 상세 정보를 위한 Bootstrap 모달 초기화
   */
  async initializeModal() {
    return new Promise((resolve) => {
      const modalElement = document.getElementById('detailsModal');
      if (!modalElement) {
        resolve();
        return;
      }

      if (this.modalInstance) {
        this.modalInstance.dispose();
      }

      this.modalInstance = new bootstrap.Modal(modalElement);
      modalElement.addEventListener('hidden.bs.modal', () => {
        this.cleanup();
      });

      this.modalInstance.show();
      resolve();
    });
  }

  /**
   * Initializes charts for metric visualization.
   * 메트릭 시각화를 위한 차트 초기화
   */
  async initializeCharts() {
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isChartInitialized = false;
    chartService.initializeCharts();
    this.isChartInitialized = true;
  }

  /**
   * Processes and displays historical test data.
   * 과거 테스트 데이터 처리 및 표시
   * @param {Object} data - Historical test data
   */
  async processHistoricalData(data) {
    if (!data.memoryMetrics?.length) {
      console.log('[TestDetails] No historical metrics found');
      return;
    }

    console.log('[TestDetails] Processing historical metrics:', {
      metricsCount: data.memoryMetrics.length,
      responseTimesCount: data.responseTimes?.length
    });

    // Set chart data at once
    const chartData = {
      labels: [],
      memoryData: [],
      threadData: [],
      responseTimeData: data.responseTimes || []
    };

    // Process memory and thread data at once
    data.memoryMetrics.forEach(metric => {
      const timeLabel = new Date(metric.timestamp).toLocaleTimeString();
      chartData.labels.push(timeLabel);

      chartData.memoryData.push({
        heap: Math.round(metric.heapUsed / (1024 * 1024)),
        young: Math.round(metric.youngGenUsed / (1024 * 1024)),
        old: Math.round(metric.oldGenUsed / (1024 * 1024)),
        nonHeap: Math.round(metric.nonHeapUsed / (1024 * 1024)),
        metaspace: Math.round(metric.metaspaceUsed / (1024 * 1024))
      });

      if (metric.performanceThreadPool) {
        chartData.threadData.push({
          active: metric.performanceThreadPool.activeThreads,
          queued: metric.performanceThreadPool.queueSize,
          pool: metric.performanceThreadPool.poolSize
        });
      }
    });

    // Update all charts at once
    this.updateAllCharts(chartData);

    // Update UI
    this.updateMetricsDisplay({
      testStatus: data,
      metrics: data.memoryMetrics[data.memoryMetrics.length - 1],
      threadMetrics: data.threadMetrics
    });
  }

  /**
   * Updates all charts with new data.
   * 새로운 데이터로 모든 차트 업데이트
   * @param {Object} chartData - Chart update data
   */
  updateAllCharts(chartData) {
    const charts = chartService.charts;

    // Response Time Chart
    const responseTimeChart = charts.get('responseTime');
    if (responseTimeChart) {
      // Reset all data
      responseTimeChart.data.labels = [];
      responseTimeChart.data.datasets[0].data = [];

      // Set new data
      responseTimeChart.data.labels = Array.from(
          {length: chartData.responseTimeData.length}, (_, i) => i + 1);
      responseTimeChart.data.datasets[0].data = [...chartData.responseTimeData];
      responseTimeChart.update('none');
    }

    // Memory Chart
    const memoryChart = charts.get('memory');
    if (memoryChart) {
      memoryChart.data.labels = [];
      memoryChart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      memoryChart.update('none');

      memoryChart.data.labels = [...chartData.labels];
      memoryChart.data.datasets[0].data = chartData.memoryData.map(d => d.heap);
      memoryChart.data.datasets[1].data = chartData.memoryData.map(
          d => d.young);
      memoryChart.data.datasets[2].data = chartData.memoryData.map(d => d.old);
      memoryChart.update('none');
    }

    // Non-Heap Chart
    const nonHeapChart = charts.get('nonHeap');
    if (nonHeapChart) {
      nonHeapChart.data.labels = [];
      nonHeapChart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      nonHeapChart.update('none');

      nonHeapChart.data.labels = [...chartData.labels];
      nonHeapChart.data.datasets[0].data = chartData.memoryData.map(
          d => d.nonHeap);
      nonHeapChart.data.datasets[1].data = chartData.memoryData.map(
          d => d.metaspace);
      nonHeapChart.update('none');
    }

    // Thread Chart
    const threadChart = charts.get('thread');
    if (threadChart) {
      threadChart.data.labels = [];
      threadChart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      threadChart.update('none');

      threadChart.data.labels = [...chartData.labels];
      threadChart.data.datasets[0].data = chartData.threadData.map(
          d => d.active);
      threadChart.data.datasets[1].data = chartData.threadData.map(
          d => d.queued);
      threadChart.data.datasets[2].data = chartData.threadData.map(d => d.pool);
      threadChart.update('none');
    }
  }

  /**
   * Updates chart data with new metrics.
   * 새로운 메트릭으로 차트 데이터 업데이트
   * @param {Object} chartData - Chart data
   * @param {Object} metric - New metric
   * @param {Object} testStatus - Test status
   */
  updateChartData(chartData, metric, testStatus) {
    const timeLabel = new Date(metric.timestamp).toLocaleTimeString();

    if (!chartData.labels.includes(timeLabel)) {
      chartData.labels.push(timeLabel);
    }

    chartData.memoryData.push({
      heap: Math.round(metric.heapUsed / (1024 * 1024)),
      young: Math.round(metric.youngGenUsed / (1024 * 1024)),
      old: Math.round(metric.oldGenUsed / (1024 * 1024)),
      nonHeap: Math.round(metric.nonHeapUsed / (1024 * 1024)),
      metaspace: Math.round(metric.metaspaceUsed / (1024 * 1024))
    });

    if (metric.performanceThreadPool) {
      chartData.threadData.push({
        active: metric.performanceThreadPool.activeThreads,
        queued: metric.performanceThreadPool.queueSize,
        pool: metric.performanceThreadPool.poolSize
      });
    }

    if (testStatus.responseTimes?.length) {
      chartData.responseTimeData = [...testStatus.responseTimes];
    }
  }

  /**
   * Sets up real-time monitoring for ongoing tests.
   * Establishes SSE connection and handles incoming metrics updates.
   * 진행 중인 테스트에 대한 실시간 모니터링 설정
   * SSE 연결을 설정하고 들어오는 메트릭 업데이트 처리
   *
   * @param {Object} data - Initial test data
   * @param {Object} testState - Test state
   */
  setupRealtimeMonitoring(data, testState) {
    try {
      console.log('[TestDetails] Setting up real-time monitoring');

      // 초기 데이터 표시
      this.updateMetricsDisplay({
        testStatus: data,
        metrics: data.memoryMetrics?.[0],
        threadMetrics: data.threadMetrics
      });

      // 메트릭 히스토리 초기화 또는 가져오기
      if (!this.metricsHistory.has(this.currentTestId)) {
        this.metricsHistory.set(this.currentTestId, []);
      }

      const metricsList = this.metricsHistory.get(this.currentTestId);

      // 기존 히스토리 데이터가 있다면 먼저 처리
      if (metricsList.length > 0) {
        metricsList.forEach(timeSeriesData => {
          const dataKey = `${timeSeriesData.metrics.timestamp}`;
          if (!testState.processedDataPoints.has(dataKey)) {
            testState.processedDataPoints.add(dataKey);
            this.updateChartData(testState.chartData, timeSeriesData.metrics,
                timeSeriesData.testStatus);
            this.updateMetricsDisplay(timeSeriesData);
          }
        });
      }

      if (this.metricsSubscription) {
        this.metricsSubscription.unsubscribe();
        this.metricsSubscription = null;
      }

      const messageStream = metricsService.connect(this.currentTestId);
      if (!messageStream) {
        console.error('[TestDetails] Failed to establish metrics stream');
        return;
      }

      this.metricsSubscription = messageStream.subscribe({
        next: (data) => {
          if (!this.currentTestId) {
            return;
          }

          if (data.metrics) {
            // 새로운 시계열 데이터를 리스트에 추가
            metricsList.push({
              metrics: data.metrics,
              testStatus: data.testStatus,
              threadMetrics: data.threadMetrics
            });

            const dataKey = `${data.metrics.timestamp}`;
            if (!testState.processedDataPoints.has(dataKey)) {
              testState.processedDataPoints.add(dataKey);

              // 차트와 UI 업데이트
              this.updateChartData(testState.chartData, data.metrics,
                  data.testStatus);
              this.updateMetricsDisplay(data);
            }
          }

          // 테스트 완료 시 히스토리 정리
          if (data.testStatus?.completed) {
            this.metricsHistory.delete(this.currentTestId);
          }
        },
        error: (error) => {
          console.error('[TestDetails] Metrics stream error:', error);
          this.updateElement('test-status', 'Error: Connection lost');
        },
        complete: () => {
          console.log('[TestDetails] Metrics stream completed');
        }
      });
    } catch (error) {
      console.error('[TestDetails] Error in setupRealtimeMonitoring:', error);
    }
  }

  /**
   * Updates the metrics display in the UI.
   * Handles updates for test status, memory metrics, and thread metrics.
   * UI의 메트릭 표시를 업데이트
   * 테스트 상태, 메모리 메트릭, 스레드 메트릭 업데이트를 처리
   *
   * @param {Object} data - Current metrics data to display
   */
  async updateMetricsDisplay(data) {
    if (!this.isChartInitialized || !data) {
      return;
    }

    console.log('[TestDetails] Updating metrics display');

    // Test Status Updates
    if (data.testStatus) {
      this.updateElement('modal-description', data.testStatus.description);
      this.updateElement('modal-url', data.testStatus.url);
      this.updateElement('modal-method', data.testStatus.method);
      this.updateElement('modal-duration',
          calculateDuration(data.testStatus.startTime, new Date()));
      this.updateElement('modal-total-requests',
          formatNumber(data.testStatus.totalRequests));
      this.updateElement('modal-success-rate',
          `${(100 - (data.testStatus.errorRate || 0)).toFixed(2)}%`);
      this.updateElement('modal-avg-response',
          `${formatNumber(data.testStatus.averageResponseTime)} ms`);
      this.updateElement('modal-rps',
          formatNumber(data.testStatus.requestsPerSecond));

      const statusBadge = document.getElementById('test-status');
      if (statusBadge) {
        const status = data.testStatus.status || 'RUNNING';
        const badgeClass = getBadgeClass(data.testStatus);
        statusBadge.className = `badge bg-${badgeClass} text-white`;
        statusBadge.textContent = `Status: ${status}`;
      }
    }

    // Memory Metrics Updates
    if (data.metrics) {
      this.updateMemoryMetrics(data.metrics);
    }

    // Thread Metrics Updates
    if (data.threadMetrics) {
      this.updateThreadMetrics(data.threadMetrics);
    }

    // Chart Updates
    chartService.updateCharts(data);

    // Analytics Updates - testId가 있을 경우에만 analytics 요청
    if (data.testStatus?.testId) {
      try {
        const analyticsData = await analyticsService.fetchAnalytics(
            data.testStatus.testId);
        analyticsService.updateAnalyticsDisplay(analyticsData,
            this.updateElement.bind(this));
      } catch (error) {
        console.error('Error updating analytics:', error);
      }
    }
  }

  /**
   * Updates memory-related metrics in the UI.
   * Displays heap, non-heap, GC, and thread pool metrics.
   * UI의 메모리 관련 메트릭 업데이트
   * 힙, 논힙, GC, 스레드 풀 메트릭 표시
   *
   * @param {Object} metrics - Memory metrics data
   */
  updateMemoryMetrics(metrics) {
    // Heap Memory
    this.updateElement('modal-heap-used', formatBytes(metrics.heapUsed));
    this.updateElement('modal-heap-max', formatBytes(metrics.heapMax));
    this.updateElement('modal-young-gen', formatBytes(metrics.youngGenUsed));
    this.updateElement('modal-old-gen', formatBytes(metrics.oldGenUsed));

    // Non-Heap Memory
    this.updateElement('modal-nonheap-used', formatBytes(metrics.nonHeapUsed));
    this.updateElement('modal-nonheap-committed',
        formatBytes(metrics.nonHeapCommitted));
    this.updateElement('modal-metaspace-used',
        formatBytes(metrics.metaspaceUsed));

    // Thread Pool Status
    if (metrics.performanceThreadPool) {
      const pool = metrics.performanceThreadPool;
      this.updateElement('modal-active-threads', pool.activeThreads);
      this.updateElement('modal-pool-size', pool.poolSize);
      this.updateElement('modal-max-pool-size', pool.maxPoolSize);
      this.updateElement('modal-queue-size', pool.queueSize);
      this.updateElement('modal-running-threads', pool.runningThreads);
      this.updateElement('modal-waiting-threads', pool.waitingThreads);
      this.updateElement('modal-blocked-threads', pool.blockedThreads);
      this.updateElement('modal-total-threads', metrics.threadCount);
    }

    // GC Metrics
    this.updateElement('modal-young-gc-count', metrics.youngGcCount);
    this.updateElement('modal-old-gc-count', metrics.oldGcCount);
    this.updateElement('modal-gc-time',
        `${metrics.youngGcTime + metrics.oldGcTime} ms`);
  }

  /**
   * Updates thread-related metrics in the UI.
   * Displays thread state, CPU time, and other thread details.
   * UI의 스레드 관련 메트릭 업데이트
   * 스레드 상태, CPU 시간, 기타 스레드 상세 정보 표시
   *
   * @param {Object} threadMetrics - Thread metrics data
   */
  updateThreadMetrics(threadMetrics) {
    this.updateElement('method-thread-name', threadMetrics.threadName || '-');
    this.updateElement('method-thread-id', threadMetrics.threadId || '-');
    this.updateElement('method-cpu-time',
        formatDuration(threadMetrics.threadCpuTime));
    this.updateElement('method-user-time',
        formatDuration(threadMetrics.threadUserTime));
    this.updateElement('method-thread-state', threadMetrics.threadState || '-');
    this.updateElement('method-thread-priority', threadMetrics.priority || '-');
    this.updateElement('method-thread-daemon',
        threadMetrics.isDaemon != null ?
            (threadMetrics.isDaemon ? 'Yes' : 'No') : '-');
  }

  /**
   * Updates a single DOM element with new value.
   * Handles null values with default display('-').
   * 단일 DOM 엘리먼트를 새로운 값으로 업데이트
   * null 값을 기본 표시 '-'로 처리
   *
   * @param {string} id - DOM element ID to update
   * @param {*} value - New value to display
   */
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value ?? '-';
    }
  }

  /**
   * Cleans up resources and resets state.
   * 리소스 정리 및 상태 초기화
   */
  cleanup() {
    console.log('[TestDetails] Cleaning up all resources');

    if (this.metricsSubscription) {
      this.metricsSubscription.unsubscribe();
      this.metricsSubscription = null;
    }

    if (this.currentTestId) {
      const testState = this.getTestState(this.currentTestId);
      testState.processedDataPoints.clear();
    }

    chartService.destroyCharts();
    this.isChartInitialized = false;
    this.currentTestId = null;
  }
}

export const testDetailsManager = new TestDetailsManager();