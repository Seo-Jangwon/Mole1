/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip
} from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/+esm';

Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Legend,
    Tooltip
);

/**
 * Managing real-time performance metric visualizations.
 * 실시간 성능 메트릭 시각화 관리
 */
class ChartService {

  /**
   * Initializes ChartService with default configuration.
   * 기본 설정으로 ChartService 초기화
   */
  constructor() {
    this.charts = new Map();
    this.MAX_DATA_POINTS = 50;
    this.initialized = false;
  }

  /**
   * Initializes all chart instances with saved data restoration.
   * Handles memory usage, thread status, and response time visualizations.
   * 저장된 데이터를 복원하여 모든 차트 인스턴스 초기화
   * 메모리 사용량, 스레드 상태, 응답 시간 시각화 처리
   */
  initializeCharts() {
    console.log('Initializing charts');

    this.destroyCharts();

    const chartConfigs = {
      responseTime: {
        id: 'responseTimeChart',
        title: 'Response Time (ms)',
        datasets: [
          {label: 'Response Time', color: 'rgb(75, 192, 192)'}
        ],
      },
      memory: {
        id: 'memoryChart',
        title: 'Memory Usage (MB)',
        datasets: [
          {label: 'Heap Usage', color: 'rgb(54, 162, 235)'},
          {label: 'Young Gen', color: 'rgb(255, 99, 132)'},
          {label: 'Old Gen', color: 'rgb(75, 192, 192)'}
        ],
      },
      nonHeap: {
        id: 'nonHeapChart',
        title: 'Non-Heap Memory (MB)',
        datasets: [
          {label: 'Non-Heap Used', color: 'rgb(153, 102, 255)'},
          {label: 'Metaspace Used', color: 'rgb(255, 159, 64)'}
        ],
      },
      thread: {
        id: 'threadChart',
        title: 'Thread Pool Status',
        datasets: [
          {label: 'Active Threads', color: 'rgb(75, 192, 192)'},
          {label: 'Queue Size', color: 'rgb(255, 205, 86)'},
          {label: 'Pool Size', color: 'rgb(153, 102, 255)'}
        ],
      }
    };

    Object.entries(chartConfigs).forEach(([type, config]) => {
      this.initializeChart(type, config);
    });

    this.initialized = true;
    console.log('Charts initialized with clean state');
  }

  /**
   * Initializes a single chart with specified configuration.
   * 지정된 설정으로 단일 차트 초기화
   * @param {string} type - Chart type
   * @param {Object} config - Chart configuration
   */
  initializeChart(type, config) {
    const ctx = document.getElementById(config.id)?.getContext('2d');
    if (!ctx) {
      console.warn(`Canvas context not found for chart: ${config.id}`);
      return;
    }

    const chartData = {
      labels: [],
      datasets: config.datasets.map(ds => ({
        label: ds.label,
        borderColor: ds.color,
        data: [],
        fill: false,
        cubicInterpolationMode: 'monotone'
      }))
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      elements: {
        line: {tension: 0.1},
        point: {radius: 0}
      },
      scales: {
        x: {
          type: 'category',
          display: true,
          grid: {
            drawOnChartArea: true
          },
          ticks: {
            maxTicksLimit: 10
          }
        },
        y: {
          type: 'linear',
          display: true,
          beginAtZero: true,
          title: {
            display: true,
            text: config.title
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          animation: false
        }
      }
    };

    this.charts.set(type, new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: options
    }));
  }

  /**
   * Updates charts with new metrics data.
   * 새로운 메트릭 데이터로 차트 업데이트
   * @param {Object} data - Metrics data
   */
  updateCharts(data) {
    if (!this.initialized || !data) {
      console.warn('Charts not initialized or no data provided');
      return;
    }

    const timestamp = new Date(data.metrics?.timestamp).toLocaleTimeString();

    // Update Response Time Chart
    if (data.testStatus?.responseTimes?.length > 0) {
      const chart = this.charts.get('responseTime');
      if (chart) {
        chart.data.labels = Array.from(
            {length: data.testStatus.responseTimes.length}, (_, i) => i + 1);
        chart.data.datasets[0].data = [...data.testStatus.responseTimes];
        chart.update('none');
      }
    }

    // Update Memory Chart
    if (data.metrics) {
      const memoryChart = this.charts.get('memory');
      if (memoryChart) {
        const newData = [
          Math.round(data.metrics.heapUsed / (1024 * 1024)),
          Math.round(data.metrics.youngGenUsed / (1024 * 1024)),
          Math.round(data.metrics.oldGenUsed / (1024 * 1024))
        ];

        if (memoryChart.data.labels.length >= this.MAX_DATA_POINTS) {
          memoryChart.data.labels.shift();
          memoryChart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        memoryChart.data.labels.push(timestamp);
        memoryChart.data.datasets.forEach((dataset, i) => {
          dataset.data.push(newData[i]);
        });
        memoryChart.update('none');
      }

      // Update Non-Heap Chart
      const nonHeapChart = this.charts.get('nonHeap');
      if (nonHeapChart) {
        const newData = [
          Math.round(data.metrics.nonHeapUsed / (1024 * 1024)),
          Math.round(data.metrics.metaspaceUsed / (1024 * 1024))
        ];

        if (nonHeapChart.data.labels.length >= this.MAX_DATA_POINTS) {
          nonHeapChart.data.labels.shift();
          nonHeapChart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        nonHeapChart.data.labels.push(timestamp);
        nonHeapChart.data.datasets.forEach((dataset, i) => {
          dataset.data.push(newData[i]);
        });
        nonHeapChart.update('none');
      }

      // Update Thread Chart
      if (data.metrics.performanceThreadPool) {
        const threadChart = this.charts.get('thread');
        if (threadChart) {
          const newData = [
            data.metrics.performanceThreadPool.activeThreads,
            data.metrics.performanceThreadPool.queueSize,
            data.metrics.performanceThreadPool.poolSize
          ];

          if (threadChart.data.labels.length >= this.MAX_DATA_POINTS) {
            threadChart.data.labels.shift();
            threadChart.data.datasets.forEach(dataset => dataset.data.shift());
          }
          threadChart.data.labels.push(timestamp);
          threadChart.data.datasets.forEach((dataset, i) => {
            dataset.data.push(newData[i]);
          });
          threadChart.update('none');
        }
      }
    }
  }

  /**
   * Unused Methods
   * Updates a single metric across all relevant charts.
   * Handles individual metric updates efficiently.
   * 관련된 모든 차트에서 단일 메트릭 업데이트
   * 개별 메트릭 업데이트 처리
   *
   * @param {Object} data - Metric data to update
   */
  /*  updateSingleMetric(data) {
      const {metrics, testStatus} = data;
      const timeLabel = new Date(metrics.timestamp).toLocaleTimeString();

      // Memory Charts
      this.updateDataset('memory', metrics.timestamp, [
        Math.round(metrics.heapUsed / (1024 * 1024)),
        Math.round(metrics.youngGenUsed / (1024 * 1024)),
        Math.round(metrics.oldGenUsed / (1024 * 1024))
      ]);

      // Non-Heap Memory
      this.updateDataset('nonHeap', metrics.timestamp, [
        Math.round(metrics.nonHeapUsed / (1024 * 1024)),
        Math.round(metrics.metaspaceUsed / (1024 * 1024))
      ]);

      // Thread Pool
      if (metrics.performanceThreadPool) {
        this.updateDataset('thread', timeLabel, [
          metrics.performanceThreadPool.activeThreads,
          metrics.performanceThreadPool.queueSize,
          metrics.performanceThreadPool.poolSize
        ]);
      }

      // Response Times
      if (testStatus?.responseTimes?.length > 0) {
        const chart = this.charts.get('responseTime');
        if (chart) {
          const times = testStatus.responseTimes;
          chart.data.labels = times.map((_, i) => i + 1);
          chart.data.datasets[0].data = times;
          chart.update('none');
        }
      }
    }*/

  /**
   * Unused Methods
   * Updates charts with a batch of metrics data.
   * Optimizes performance for bulk updates.
   * 메트릭 데이터 배치로 차트 업데이트
   * 대량 업데이트에 대한 성능 최적화
   *
   * @param {Object} data - Batch of metrics data
   */
  /*  updateBatchMetrics(data) {
      const {metrics, labels} = data;

      metrics.forEach((metric, index) => {
        const timestamp = labels[index];

        // Memory Charts
        this.updateDataset('memory', timestamp, [
          Math.round(metric.heapUsed / (1024 * 1024)),
          Math.round(metric.youngGenUsed / (1024 * 1024)),
          Math.round(metric.oldGenUsed / (1024 * 1024))
        ]);

        // Thread Pool
        if (metric.performanceThreadPool) {
          this.updateDataset('thread', timestamp, [
            metric.performanceThreadPool.activeThreads,
            metric.performanceThreadPool.queueSize,
            metric.performanceThreadPool.poolSize
          ]);
        }
      });

      // Response Times
      if (data.testStatus?.responseTimes?.length > 0) {
        const chart = this.charts.get('responseTime');
        if (chart) {
          chart.data.labels = data.testStatus.responseTimes.map((_, i) => i + 1);
          chart.data.datasets[0].data = data.testStatus.responseTimes;
          chart.update('none');
        }
      }
    }*/

  /**
   * Unused Methods
   * Processes chart updates with comprehensive logging.
   * Handles all types of metric updates with detailed tracking.
   * 포괄적인 로깅과 함께 차트 업데이트 처리
   * 모든 유형의 메트릭 업데이트 처리
   *
   * @param {Object} data - Metric data to process
   */
  /*  processChartUpdate(data) {
      if (!data?.metrics?.timestamp) {
        console.log('[Chart] Received data structure:', data);
        return;
      }

      console.log('[Chart] Processing update with data:', {
        timestamp: data.metrics.timestamp,
        heapUsed: data.metrics.heapUsed,
        threadPool: data.metrics.performanceThreadPool,
        testStatus: data.testStatus
      });

      const elapsedSeconds = Math.floor(
          (new Date(data.metrics.timestamp) - this.startTime) / 1000);

      // Memory Metrics
      this.updateMemoryMetrics(data.metrics);
      this.updateThreadMetrics(data.metrics);
      this.updateGCMetrics(data.metrics);

      // Response Times
      if (data.testStatus?.responseTimes?.length) {
        this.updateResponseTimes(data.testStatus.responseTimes);
      }
    }*/

  /**
   * Unused Methods
   * Updates memory metrics in charts.
   * Updates both heap and non-heap memory visualizations.
   * 메모리 메트릭을 차트에 업데이트
   * 힙과 논힙 메모리 시각화를 모두 업데이트
   *
   * @param {Object} metrics - Memory metrics data
   */
  /*  updateMemoryMetrics(metrics) {
      this.updateDataset('memory', metrics.timestamp, [
        metrics.heapUsed / (1024 * 1024),
        metrics.youngGenUsed / (1024 * 1024),
        metrics.oldGenUsed / (1024 * 1024)
      ]);

      this.updateDataset('nonHeap', metrics.timestamp, [
        metrics.nonHeapUsed / (1024 * 1024),
        metrics.metaspaceUsed / (1024 * 1024)
      ]);
    }*/

  /**
   * Unused Methods
   * Updates thread metrics in charts and UI elements.
   * Updates thread pool status and related UI components.
   * 스레드 메트릭을 차트와 UI 요소에 업데이트
   * 스레드 풀 상태와 관련 UI 컴포넌트 업데이트
   *
   * @param {Object} metrics - Thread metrics data
   */
  /*  updateThreadMetrics(metrics) {
      if (!metrics.performanceThreadPool) {
        return;
      }
      const pool = metrics.performanceThreadPool;
      this.updateDataset('thread', metrics.timestamp, [
        pool.activeThreads,
        pool.queueSize,
        pool.poolSize,
        metrics.threadCount
      ]);

      // Update Thread Details
      this.updateElement('modal-active-threads', pool.activeThreads);
      this.updateElement('modal-pool-size', pool.poolSize);
      this.updateElement('modal-queue-size', pool.queueSize);
      this.updateElement('modal-total-threads', metrics.threadCount);
    }*/

  /**
   * Unused Methods
   * Updates garbage collection metrics in UI elements.
   * Updates young/old generation GC counts and times.
   * 가비지 컬렉션 메트릭을 UI 요소에 업데이트
   * Young/Old 세대 GC 횟수와 시간 업데이트
   *
   * @param {Object} metrics - GC metrics data
   */
  /*  updateGCMetrics(metrics) {
      this.updateElement('modal-young-gc-count', metrics.youngGcCount);
      this.updateElement('modal-old-gc-count', metrics.oldGcCount);
      this.updateElement('modal-gc-time',
          `${metrics.youngGcTime + metrics.oldGcTime} ms`);
    }*/

  /**
   * Unused Methods
   * Updates response time chart with new data.
   * Updates response time visualization.
   * 응답 시간 차트를 새 데이터로 업데이트
   * 응답 시간 시각화 업데이트
   *
   * @param {Array} responseTimes - Array of response times
   */
  /*  updateResponseTimes(responseTimes) {
      const chart = this.charts.get('responseTime');
      if (chart) {
        chart.data.labels = responseTimes.map((_, i) => i + 1);
        chart.data.datasets[0].data = responseTimes;
        chart.update('none');
      }
    }*/

  /**
   * Unused Methods
   * Updates a DOM element's text content.
   * Updates UI elements with metric values.
   * DOM 요소의 텍스트 내용 업데이트
   * 메트릭 값으로 UI 요소 업데이트
   *
   * @param {string} id - Element ID to update
   * @param {*} value - New value to display
   */
  /*  updateElement(id, value) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value ?? '-';
      }
    }*/

  /**
   * Unused Methods
   * Updates a chart's dataset while maintaining data point limit.
   * Manages sliding window of data points for real-time visualization.
   * 데이터 포인트 제한을 유지하면서 차트 데이터셋 업데이트
   * 실시간 시각화를 위한 데이터 포인트의 슬라이딩 윈도우 관리
   *
   * @param {string} chartType - Type of chart to update
   * @param {string} timeLabel - Time label for data point
   * @param {Array} values - Array of values to update
   */

  /*  updateDataset(chartType, timeLabel, values) {
      const chart = this.charts.get(chartType);
      if (!chart) {
        console.warn(`Chart not found: ${chartType}`);
        return;
      }

      // Limit data points
      if (chart.data.labels.length >= this.MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(dataset => dataset.data.shift());
      }

      chart.data.labels.push(timeLabel);
      chart.data.datasets.forEach((dataset, i) => {
        dataset.data.push(values[i] || 0);
      });

      chart.update('none');
    }*/

  /**
   * Destroys all chart instances and cleans up resources.
   * 모든 차트 인스턴스 제거 및 리소스 정리
   */
  destroyCharts() {
    this.charts.forEach(chart => {
      try {
        chart.destroy();
      } catch (error) {
        console.error('Error destroying chart:', error);
      }
    });
    this.charts.clear();
    this.initialized = false;
  }

  /**
   * Unused Methods
   * Resets all chart data to initial state.
   * 모든 차트 데이터를 초기 상태로 재설정
   */
  /*  resetChartData() {
      this.charts.forEach(chart => {
        chart.data.labels = [];
        chart.data.datasets.forEach(dataset => {
          dataset.data = [];
        });
        chart.update('none');
      });
    }*/

}

export const chartService = new ChartService();