/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

import {testDetailsManager} from './components/TestDetailsManager.js';
import {metricsService} from './core/MetricsSSEService.js';
import {
  formatNumber,
  escapeHtml,
  getStatusText,
  getStatusClass,
  getBadgeClass
} from './utils/formatters.js';

/**
 * MainManager class for handling core application functionality.
 * Manages:
 * - Endpoint selection and display
 * - Test configuration and execution
 * - Results visualization
 * - User interface interactions
 */
class MainManager {
  constructor() {
    this.endpointsData = {};
    this.selectedEndpoint = null;
    this.editor = null;
    this.pollCount = 0;
    this.MAX_POLLS = 60;
    this.isTestRunning = false;
    this.currentTestId = null
  }

  /**
   * Initializes application components and loads initial data.
   * Sets up JSON editor, event listeners, and endpoint data.
   * 애플리케이션 컴포넌트 초기화 및 초기 데이터 로드
   * JSON 에디터, 이벤트 리스너, 엔드포인트 데이터 설정
   */
  async initialize() {
    this.initializeJsonEditor();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  /**
   * Sets up the JSON editor for request body configuration.
   * Request body 구성을 위한 JSON 에디터 설정
   */
  initializeJsonEditor() {
    const container = document.getElementById('jsonEditor');
    this.editor = new window.JSONEditor(container, {
      mode: 'code',
      statusBar: false,
      mainMenuBar: false
    });
    this.editor.set({});
  }

  /**
   * Configures event listeners for header management and form submission.
   * 헤더 관리와 폼 제출을 위한 이벤트 리스너 구성
   */
  setupEventListeners() {
    // Add/delete header event
    document.addEventListener('click', this.handleHeaderRowClick.bind(this));

    // Submit form event
    document.getElementById('testForm').addEventListener('submit',
        this.handleFormSubmit.bind(this));
  }

  /**
   * Manages header row addition and removal in the configuration form.
   * 설정 폼에서 헤더 행 추가 및 제거 관리
   * @param {Event} e - Click event object
   */
  handleHeaderRowClick(e) {
    if (e.target.matches('.add-header')) {
      const headerRow = e.target.closest('.header-row');
      const newRow = headerRow.cloneNode(true);
      newRow.querySelectorAll('input').forEach(input => input.value = '');
      headerRow.parentNode.insertBefore(newRow, headerRow.nextSibling);
    } else if (e.target.matches('.remove-header')) {
      const headerRow = e.target.closest('.header-row');
      if (document.querySelectorAll('.header-row').length > 1) {
        headerRow.remove();
      }
    }
  }

  /**
   * Loads initial endpoint and test result data from the server.
   * 서버에서 초기 엔드포인트 및 테스트 결과 데이터 로드
   */
  async loadInitialData() {
    try {
      const response = await fetch('/performanceMeasure/endpoints');
      if (response.ok) {
        this.endpointsData = await response.json();
        this.initializeEndpointView();
      }

      const resultsResponse = await fetch('/performanceMeasure/results');
      if (resultsResponse.ok) {
        const results = await resultsResponse.json();
        results.forEach(result => this.updateResultsTable(result));
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      this.showError('Failed to load test endpoints');
    }
  }

  /**
   * Processes test form submission and initiates performance test.
   * 테스트 폼 제출 처리 및 성능 테스트 시작
   * @param {Event} e - Form submission event
   */
  async handleFormSubmit(e) {
    e.preventDefault();

    if (this.isTestRunning) {
      this.showError('Test is already running');
      return;
    }

    if (!this.selectedEndpoint) {
      this.showError('Please select an endpoint first');
      return;
    }

    let jsonBody;
    try {
      jsonBody = this.editor.get();
    } catch (error) {
      this.showError('Invalid JSON in request body');
      return;
    }

    const requestData = {
      description: document.getElementById('description').value,
      url: window.location.origin + this.selectedEndpoint.endpointUrl,
      method: this.selectedEndpoint.httpMethod,
      requestBody: JSON.stringify(jsonBody),
      headers: this.getHeaders(),
      concurrentUsers: parseInt(
          document.getElementById('concurrentUsers').value),
      repeatCount: parseInt(document.getElementById('repeatCount').value),
      rampUpSeconds: parseInt(document.getElementById('rampUpSeconds').value),
      timeoutSeconds: parseInt(document.getElementById('timeoutSeconds').value)
    };

    try {
      const response = await fetch('/performanceMeasure/run', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        const testId = await response.text();
        this.currentTestId = testId;
        this.isTestRunning = true;
        this.showSuccess('Test started successfully');

        metricsService.connect(testId);
        await this.pollTestStatus(testId);
      } else {
        throw new Error('Failed to start test');
      }
    } catch (error) {
      this.showError('Error starting test: ' + error.message);
      this.isTestRunning = false;
      this.currentTestId = null;
    }
  }

  /**
   * Initializes endpoint view with card and list displays.
   * 카드 및 리스트 표시로 엔드포인트 뷰 초기화
   */
  initializeEndpointView() {
    const cardsContainer = document.getElementById('endpointCardsView');
    const listBody = document.getElementById('endpointListBody');

    cardsContainer.innerHTML = '';
    listBody.innerHTML = '';

    // Sort endPoint
    const sortedMethods = Object.keys(this.endpointsData).sort();

    sortedMethods.forEach(method => {
      this.endpointsData[method].forEach((endpoint, index) => {

        this.addEndpointCard(endpoint, method, index);
        this.addEndpointListItem(endpoint, method, index);
      });
    });

    this.setupSearchAndFilter();
  }

  /**
   * Configures search and filtering functionality for endpoints.
   * 엔드포인트에 대한 검색 및 필터링 기능 구성
   */
  setupSearchAndFilter() {
    const searchInput = document.getElementById('endpointSearch');
    const methodFilter = document.getElementById('methodFilter');

    const filterEndpoints = () => {
      const searchTerm = searchInput.value.toLowerCase();
      const selectedMethod = methodFilter.value;

      const cards = document.querySelectorAll('.endpoint-card');
      const rows = document.querySelectorAll('#endpointListBody tr');

      [...cards, ...rows].forEach(element => {
        const id = element.dataset.endpointId;
        const [method, index] = id.split('-');
        const endpoint = this.endpointsData[method][index];

        const matchesSearch = endpoint.endpointUrl.toLowerCase().includes(
                searchTerm) ||
            endpoint.controllerClassName.toLowerCase().includes(searchTerm);
        const matchesMethod = !selectedMethod || method === selectedMethod;

        element.style.display = (matchesSearch && matchesMethod) ? '' : 'none';
      });
    };

    searchInput.addEventListener('input', filterEndpoints);
    methodFilter.addEventListener('change', filterEndpoints);
  }

  /**
   * Creates and adds a card view for an endpoint.
   * 엔드포인트에 대한 카드 뷰 생성 및 추가
   * @param {Object} endpoint - Endpoint configuration
   * @param {string} method - HTTP method
   * @param {number} index - Endpoint index
   */
  addEndpointCard(endpoint, method, index) {
    const template = document.getElementById('endpointCardTemplate');
    const card = template.content.cloneNode(true);

    const cardDiv = card.querySelector('.endpoint-card');
    cardDiv.dataset.endpointId = `${method}-${index}`;

    const badge = card.querySelector('.method-badge');
    badge.textContent = method;
    badge.classList.add(`method-${method}`);

    const title = card.querySelector('.card-title');
    title.textContent = endpoint.endpointUrl;

    const controller = card.querySelector('.card-text');
    controller.textContent = `${endpoint.controllerClassName}.${endpoint.controllerMethodName}`;

    const servicesList = card.querySelector('.services-list');
    if (endpoint.annotatedServices && endpoint.annotatedServices.length > 0) {
      endpoint.annotatedServices.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item small';
        serviceItem.innerHTML = `
                <div class="fw-bold">${service.serviceClassName}.${service.methodName}</div>
                <small class="text-muted">${service.description
        || 'No description'}</small>
            `;
        servicesList.appendChild(serviceItem);
      });
    } else {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'service-item small text-muted';
      emptyItem.textContent = 'No annotated services';
      servicesList.appendChild(emptyItem);
    }

    document.getElementById('endpointCardsView').appendChild(card);
  }

  /**
   * Creates and adds a list item for an endpoint.
   * 엔드포인트에 대한 리스트 항목 생성 및 추가
   * @param {Object} endpoint - Endpoint configuration
   * @param {string} method - HTTP method
   * @param {number} index - Endpoint index
   */
  addEndpointListItem(endpoint, method, index) {
    const tr = document.createElement('tr');
    tr.dataset.endpointId = `${method}-${index}`;

    tr.innerHTML = `
        <td><span class="badge method-badge method-${method}">${method}</span></td>
        <td>${endpoint.endpointUrl}</td>
        <td>${endpoint.controllerClassName}.${endpoint.controllerMethodName}</td>
        <td>${endpoint.annotatedServices?.length || 0} services</td>
        <td>
            <button class="btn btn-sm btn-primary" onclick="selectEndpoint(closest('tr'))">
                Select
            </button>
        </td>
    `;

    document.getElementById('endpointListBody').appendChild(tr);
  }

  /**
   * Handles endpoint selection and updates UI accordingly.
   * 엔드포인트 선택 처리 및 UI 업데이트
   * @param {HTMLElement} element - Selected endpoint element
   */
  selectEndpoint(element) {

    document.querySelectorAll('.selected-endpoint').forEach(el =>
        el.classList.remove('selected-endpoint'));

    element.classList.add('selected-endpoint');
    const [method, index] = element.dataset.endpointId.split('-');
    this.selectedEndpoint = {
      ...this.endpointsData[method][index],
      httpMethod: method
    };

    console.log('Selected Endpoint:', this.selectedEndpoint); // 디버깅용

    // Update Ui
    const methodEl = document.getElementById('selectedEndpointMethod');
    const urlEl = document.getElementById('selectedEndpointUrl');
    const descEl = document.getElementById('endpoint-description');
    const requestTypeEl = document.getElementById('requestType');
    const requestBodySection = document.getElementById('requestBodySection');

    if (methodEl) {
      methodEl.textContent = this.selectedEndpoint.httpMethod;
    }
    if (urlEl) {
      urlEl.textContent = this.selectedEndpoint.endpointUrl;
    }
    if (descEl) {
      descEl.textContent = this.selectedEndpoint.description || '-';
    }
    if (requestTypeEl) {
      requestTypeEl.textContent = this.selectedEndpoint.requestType;
    }

    // Show/hide Request Body
    if (this.selectedEndpoint.httpMethod === 'POST' ||
        this.selectedEndpoint.httpMethod === 'PUT' ||
        (this.selectedEndpoint.requestType &&
            this.selectedEndpoint.requestType.toLowerCase() !== 'void')) {
      requestBodySection.style.display = 'block';
      if (this.editor) {
        if (this.selectedEndpoint.requestExample &&
            Object.keys(this.selectedEndpoint.requestExample).length > 0) {
          console.log('Setting request example:',
              this.selectedEndpoint.requestExample);
          this.editor.set(this.selectedEndpoint.requestExample);
        } else {
          console.log('No request example available, setting empty object');
          this.editor.set({
            id: 0,
            name: "example"
          });
        }
      }
    } else {
      console.log('Hiding request body section for endpoint:',
          this.selectedEndpoint);
      requestBodySection.style.display = 'none';
    }

    // Active Run Test button
    const runTestBtn = document.getElementById('runTestBtn');
    if (runTestBtn) {
      runTestBtn.disabled = false;
    }
  }

  /**
   * Toggles between card and list view for endpoints.
   * 엔드포인트의 카드 뷰와 리스트 뷰 전환
   * @param {string} viewType - View type to display
   */
  toggleView(viewType) {
    const cardView = document.getElementById('endpointCardsView');
    const listView = document.getElementById('endpointListView');

    if (viewType === 'card') {
      cardView.classList.remove('d-none');
      listView.classList.add('d-none');
    } else {
      cardView.classList.add('d-none');
      listView.classList.remove('d-none');
    }
  }

  /**
   * Collects all configured headers from the form.
   * 폼에서 구성된 모든 헤더 수집
   * @returns {Object} Collected headers
   */
  getHeaders() {
    const headers = {};
    document.querySelectorAll('.header-row').forEach(row => {
      const keyInput = row.querySelector('input:first-of-type');
      const valueInput = row.querySelector('input:last-of-type');

      if (keyInput && valueInput) {
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (key && value) {
          headers[key] = value;
        }
      }
    });
    return headers;
  }

  /**
   * Displays error message to user.
   * 사용자에게 에러 메시지 표시
   * @param {string} message - Error message
   */
  showError(message) {
    this.showAlert(message, 'danger');
  }

  /**
   * Displays success message to user.
   * 사용자에게 성공 메시지 표시
   * @param {string} message - Success message
   */
  showSuccess(message) {
    this.showAlert(message, 'success');
  }

  /**
   * Shows alert message with specified type.
   * 지정된 유형의 알림 메시지 표시
   * @param {string} message - Alert message
   * @param {string} type - Alert type
   */
  showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
    document.querySelector('.container').insertBefore(alertDiv,
        document.querySelector('.card'));
    setTimeout(() => alertDiv.remove(), 5000);
  }

  /**
   * Clears all test results from display.
   * 디스플레이에서 모든 테스트 결과 제거
   */
  clearResults() {
    document.getElementById('resultsBody').innerHTML = '';
  }

  /**
   * Polls test status at regular intervals.
   * 정기적인 간격으로 테스트 상태 확인
   * @param {string} testId - Test identifier
   */
  async pollTestStatus(testId) {
    try {
      if (this.pollCount++ > this.MAX_POLLS) {
        this.showError("Test timed out");
        return;
      }

      const response = await fetch(`/performanceMeasure/status/${testId}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const status = await response.json();
      this.updateResultsTable(status);

      if (!status.completed) {
        setTimeout(() => this.pollTestStatus(testId), 1000);
      } else {
        this.showSuccess('Test completed successfully');
      }
    } catch (error) {
      this.showError(`Error: ${error.message}`);
    }
  }

  /**
   * Updates test results table with new status data.
   * 새로운 상태 데이터로 테스트 결과 테이블 업데이트
   * @param {Object} status - Test status data
   */
  updateResultsTable(status) {
    const tbody = document.getElementById('resultsBody');
    let row = tbody.querySelector(`tr[data-test-id="${status.testId}"]`);

    if (!row) {
      row = document.createElement('tr');
      row.setAttribute('data-test-id', status.testId);
      tbody.insertBefore(row, tbody.firstChild);
    }

    const statusText = getStatusText(status);
    const statusClass = getStatusClass(status);

    row.className = statusClass;
    row.innerHTML = `
    <td class="text-center text-break">${escapeHtml(status.description || '')}</td>
    <td class="text-center text-break"><small>${escapeHtml(status.url || '')}</small></td>
    <td class="text-center"><span class="badge bg-${getBadgeClass(
        status)}">${statusText}</span></td>
    <td class="text-center">${formatNumber(status.averageResponseTime)} ms</td>
    <td class="text-center">${formatNumber(status.maxResponseTime)} ms</td>
    <td class="text-center">${formatNumber(status.requestsPerSecond)}</td>
    <td class="text-center">${formatNumber(status.errorRate)}%</td>
    <td class="text-center">
        <div class="d-flex justify-content-center align-items-center gap-2">
            <button class="btn btn-info btn-sm d-flex align-items-center" onclick="showDetails('${status.testId}')">Details</button>
            ${!status.completed ?
        `<button class="btn btn-danger btn-sm d-flex align-items-center" onclick="window.mainManager.stopCurrentTest()">Stop</button>`
        : ''}
        </div>
    </td>
`;
  }

  /**
   * Stops the currently running test.
   * Sends a stop request to the server and handles the cleanup of UI elements.
   * Updates test status and shows appropriate success/error messages.
   *
   * 현재 실행 중인 테스트 중지
   * 서버에 중지 요청을 보내고 UI 요소의 정리를 처리
   * 테스트 상태 업데이트 및 적절한 성공/오류 메시지 표시
   *
   * @async
   * @returns {Promise<void>}
   */
  async stopCurrentTest() {
    console.log('Attempting to stop test:', this.currentTestId);

    if (!this.currentTestId) {
      console.log('No test ID found');
      return;
    }

    try {
      const response = await fetch(
          `/performanceMeasure/stop/${this.currentTestId}`, {
            method: 'POST'
          });

      if (response.ok) {
        this.showSuccess('Test stopped successfully');
        // // 모달의 stop 버튼 숨기기
        // const modalStopBtn = document.getElementById('modalStopTestBtn');
        // if (modalStopBtn) {
        //   modalStopBtn.style.display = 'none';
        // }
        this.showSuccess('Test stopped successfully');
      } else {
        this.showError('Failed to stop test');
      }
    } catch (error) {
      console.error('Error stopping test:', error);
      this.showError('Error stopping test: ' + error.message);
    } finally {
      this.isTestRunning = false;
      this.currentTestId = null;
    }
  }
}

export const mainManager = new MainManager();

window.mainManager = mainManager;
window.showDetails = (testId) => testDetailsManager.showDetails(testId);
window.selectEndpoint = (element) => mainManager.selectEndpoint(element);
window.toggleView = (viewType) => mainManager.toggleView(viewType);
window.clearResults = () => mainManager.clearResults();

window.addEventListener('load', () => mainManager.initialize());

document.getElementById('stopTestBtn')?.addEventListener('click', () => {
  mainManager.stopCurrentTest();
});