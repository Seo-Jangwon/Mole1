/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

/*
const {Subject, BehaviorSubject} = window.rxjs;
const {
  filter,
  map,
  bufferTime,
  share,
  distinctUntilChanged
} = window.rxjs.operators;
import {metricsService} from './MetricsSSEService.js';

/!**
 * Managing reactive metrics streams and monitoring.
 * 리액티브 메트릭 스트림과 모니터링 관리
 *!/
class RxMetricsService {

  constructor() {
    this.activeTestId$ = new BehaviorSubject(null);
    this.rawMetrics$ = new Subject();

    /!*    this.metrics$ = this.rawMetrics$.pipe(
            filter(data => data.testId === this.activeTestId$.value),
            bufferTime(100),
            filter(buffer => buffer.length > 0),
            map(buffer => buffer[buffer.length - 1]),
            share()
        );*!/

    /!*    this.status$ = this.metrics$.pipe(
            map(data => data.testStatus),
            filter(status => !!status),
            distinctUntilChanged(
                (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
            share()
        );*!/

    /!*    this.threadMetrics$ = this.metrics$.pipe(
            map(data => data.threadMetrics),
            filter(metrics => !!metrics),
            distinctUntilChanged(
                (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
            share()
        );*!/
  }

  /!**
   * Starts monitoring metrics for a specific test.
   * Establishes metrics stream connection and sets up data subscription.
   * 특정 테스트에 대한 메트릭 모니터링 시작
   * 메트릭 스트림 연결을 수립하고 데이터 구독 설정
   *
   * @param {string} testId - Unique identifier for the test to monitor
   *!/
  startMonitoring(testId) {
    console.log('[RxMetrics] Starting monitoring for test:', testId);
    this.activeTestId$.next(testId);
    const metricsStream = metricsService.connect(testId);
    if (metricsStream) {
      metricsStream.subscribe({
        next: data => {
          console.log('[RxMetrics] Received data:', data);
          this.rawMetrics$.next(data);
        },
        error: error => console.error('[RxMetrics] Error:', error)
      });
    }
  }

  /!**
   * Unused Methods
   * Stops ongoing metrics monitoring.
   * Cleans up connections and resets monitoring state.
   * 진행 중인 메트릭 모니터링 중지
   * 연결을 정리하고 모니터링 상태 초기화
   *!/
  /!*  stopMonitoring() {
      console.log('[RxMetrics] Stopping monitoring');
      metricsService.cleanup();
      this.activeTestId$.next(null);
    }*!/
}

export const rxMetricsService = new RxMetricsService();*/