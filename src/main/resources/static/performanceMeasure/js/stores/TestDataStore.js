/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

/*
const {BehaviorSubject} = window.rxjs;
import {rxMetricsService} from '../core/RxMetricsService.js';

class TestDataStore {
  constructor() {
    this.activeTestId$ = new BehaviorSubject(null);
    this.testData = new Map();
    this.dataCleanupInterval = 1000 * 60 * 60; // 1시간
    this.maxStoredTests = 10;

    // 정기적인 데이터 정리 설정
    setInterval(() => this._cleanupOldData(), this.dataCleanupInterval);
  }

  setActiveTest(testId) {
    this.activeTestId$.next(testId);
    rxMetricsService.startMonitoring(testId);

    if (!this.testData.has(testId)) {
      this.testData.set(testId, this._initializeTestData());
    }
  }

  _initializeTestData() {
    return {
      metrics: [],
      threadMetrics: null,
      status: null,
      lastUpdated: Date.now()
    };
  }

  _cleanupOldData() {
    const maxAge = 24 * 60 * 60 * 1000;  // 24시간
    const now = Date.now();
    const activeTestId = this.activeTestId$.value;

    // 완료된 테스트 중 오래된 것 정리
    for (const [testId, data] of this.testData.entries()) {
      // 활성 테스트는 제외
      if (testId === activeTestId) {
        continue;
      }

      // 완료된 테스트이고 24시간 이상 지났으면 제거
      if (data.status?.completed && (now - data.lastUpdated > maxAge)) {
        this.testData.delete(testId);
        console.log(`Cleaned up old test data: ${testId}`);
      }
    }

    // 최대 저장 개수 초과 시 가장 오래된 것부터 제거
    if (this.testData.size > this.maxStoredTests) {
      const sortedTests = Array.from(this.testData.entries())
      .filter(([id]) => id !== activeTestId)
      .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);

      const numberOfTestsToRemove = this.testData.size - this.maxStoredTests;
      sortedTests.slice(0, numberOfTestsToRemove).forEach(([id]) => {
        this.testData.delete(id);
        console.log(`Removed excess test data: ${id}`);
      });
    }
  }
}

export const testDataStore = new TestDataStore();*/