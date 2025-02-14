/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

interface Endpoint {
  endpointUrl: string;
  controllerClassName: string;
  controllerMethodName: string;
  requestType?: string;
  requestExample?: Object;
  description?: string;
  httpMethod?: string;
  annotatedServices?: Array<{
    serviceClassName: string;
    methodName: string;
    description?: string;
  }>;
}

interface StatusResponse {
  testId: string;                 // 테스트 고유 ID
  status: string;                 // 테스트 상태
  description?: string;           // 테스트 설명
  url?: string;                   // 테스트 대상 URL
  method?: string;                // HTTP 메서드 (GET, POST 등)
  startTime?: Date;               // 테스트 시작 시간
  averageResponseTime: number;    // 평균 응답 시간 (ms)
  maxResponseTime: number;        // 최대 응답 시간 (ms)
  requestsPerSecond: number;      // 초당 요청 수
  errorRate: number;              // 에러율 (%)
  completed: boolean;             // 테스트 완료 여부
  totalRequests?: number;         // 총 요청 수
  responseTimes?: number[];       // 응답 시간 배열
  percentiles?: {                 // 응답 시간 퍼센타일
    p50: number;                  // 50번째 퍼센타일 (중앙값)
    p75: number;                  // 75번째 퍼센타일
    p95: number;                  // 95번째 퍼센타일
    p99: number;                  // 99번째 퍼센타일
  };

  // REST API 응답 필드
  endpointUrl?: string;
  requestType?: string;
  httpMethod?: string;
  controllerClassName?: string;
  controllerMethodName?: string;
  annotatedServices?: Array<{
    serviceClassName: string;
    methodName: string;
    description?: string;
  }>;

  // WebSocket 메시지 필드
  testStatus?: {
    testId: string;
    description: string;
    url: string;
    method: string;
    startTime?: Date;
    averageResponseTime: number;
    maxResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    completed: boolean;
    totalRequests?: number;
    responseTimes?: number[];
  };
  metrics?: MemoryMetrics;        // 메모리 메트릭
  threadMetrics?: ThreadMetrics;  // 스레드 메트릭
  memoryMetrics?: MemoryMetrics[]; // 히스토리 메트릭 배열
}

interface AnalyticsData {
  percentiles: {
    p50: number;
    p75: number;
    p95: number;
    p99: number;
  };
  statistics: {
    standardDeviation: number;
    mean: number;
    min: number;
    max: number;
  };
  outliers: number;
  coefficientOfVariation: number;
  stabilityScore: number;
}

interface ThreadMetrics {
  threadName?: string;
  threadId?: string;
  threadCpuTime?: number;
  threadUserTime?: number;
  threadState?: string;
  priority?: number;
  isDaemon?: boolean;
  stackTrace?: Array<{
    className: string;
    methodName: string;
    fileName: string;
    lineNumber: number;
  }>;
}

interface TestResult {
  memoryMetrics?: MemoryMetrics[];
  responseTimes?: number[];
  completed?: boolean;
}

interface MemoryMetrics {
  timestamp: number;
  heapUsed: number;
  heapMax: number;
  youngGenUsed: number;
  oldGenUsed: number;
  nonHeapUsed: number;
  nonHeapCommitted: number;
  metaspaceUsed: number;
  youngGcCount: number;
  oldGcCount: number;
  youngGcTime: number;
  oldGcTime: number;
  threadCount: number;
  performanceThreadPool: ThreadPoolMetrics;
}

interface ThreadPoolMetrics {
  activeThreads: number;
  queueSize: number;
  poolSize: number;
  maxPoolSize: number;
  runningThreads: number;
  waitingThreads: number;
  blockedThreads: number;
}

interface TestResult {
  description?: string;
  url?: string;
  method?: string;
  startTime?: Date;
  totalRequests: number;
  errorRate: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  metrics?: MemoryMetrics;
  daemon?: string;
  threadMetrics?: ThreadMetrics;
}

interface BootstrapModal {
  show(): void;

  hide(): void;

  dispose(): void;
}

interface BootstrapStatic {
  Modal: {
    new(element: HTMLElement | null, options?: any): BootstrapModal;
  };
}

interface Window {
  JSONEditor: any;
  bootstrap: BootstrapStatic;
}

interface JSONEditorOptions {
  mode?: 'tree' | 'view' | 'form' | 'code' | 'text';
  statusBar?: boolean;
  mainMenuBar?: boolean;
}

declare class JSONEditor {
  constructor(container: HTMLElement, options?: JSONEditorOptions);

  set(json: any): void;

  get(): any;

  destroy(): void;
}