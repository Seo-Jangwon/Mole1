/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

package com.monitor.annotation.scanner;

import com.monitor.annotation.annotation.PerformanceMeasure;
import com.monitor.annotation.dto.PerformanceEndpoint;
import java.lang.reflect.Modifier;
import java.lang.reflect.Parameter;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;

/**
 * Scanner for detecting and analyzing endpoints that can be performance tested.
 * Scans Spring controllers for methods annotated with @PerformanceMeasure and
 * collects detailed information about endpoints including request/response types,
 * HTTP methods, and associated service methods.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PerformanceEndpointScanner {

    private final ApplicationContext applicationContext;
    private volatile Map<String, List<PerformanceEndpoint>> cachedEndpoints;

    /**
     * Main scanning method that finds all endpoints available for performance testing.
     * Results are cached to improve performance on subsequent calls.
     *
     * @return Map of HTTP methods to their corresponding endpoints
     */
    public Map<String, List<PerformanceEndpoint>> scanEndpoints() {
        if (cachedEndpoints == null) {
            synchronized (this) {
                if (cachedEndpoints == null) {
                    cachedEndpoints = doScanEndpoints();
                }
            }
        }
        return new HashMap<>(cachedEndpoints);
    }

    private Map<String, List<PerformanceEndpoint>> doScanEndpoints() {
        Map<String, List<PerformanceEndpoint>> endpointMap = new HashMap<>();

        try {
            Map<String, Object> controllers = new HashMap<>();
            controllers.putAll(applicationContext.getBeansWithAnnotation(RestController.class));
            controllers.putAll(applicationContext.getBeansWithAnnotation(Controller.class));

            log.info("Controller canning tart: {} controllers found", controllers.size());

            for (Object controller : controllers.values()) {
                Class<?> controllerClass = controller.getClass();
                String baseUrl = getControllerBaseUrl(controllerClass);

                // Get the actual class in case of AOP proxy
                if (controllerClass.getSimpleName().contains("$$")) {
                    controllerClass = controllerClass.getSuperclass();
                }

//                log.info("Processing controllers: {}", controllerClass.getSimpleName());

                for (Method method : controllerClass.getDeclaredMethods()) {
                    if (method.isAnnotationPresent(PerformanceMeasure.class)) {
                        String url = getMethodUrl(method, baseUrl);
                        String httpMethod = getHttpMethod(method);

                        if (url != null && httpMethod != null) {
                            PerformanceEndpoint endpoint = createEndpoint(controllerClass, method,
                                url, httpMethod);
                            endpointMap.computeIfAbsent(httpMethod, k -> new ArrayList<>())
                                .add(endpoint);
//                            log.info("Endpoint Added: {} {}", httpMethod, url);
                        }
                    }
                }
            }

        } catch (Exception e) {
            log.error("Error occurred while scanning", e);
        }

        return endpointMap;
    }

    /**
     * Extracts the base URL of the controller
     */
    private String getControllerBaseUrl(Class<?> controllerClass) {
        // Get the actual class in case of Spring CGLIB proxy
        if (controllerClass.getSimpleName().contains("$$")) {
            controllerClass = controllerClass.getSuperclass();
        }

        String baseUrl = "";

        // Check for RequestMapping annotation
        RequestMapping requestMapping = controllerClass.getAnnotation(RequestMapping.class);
        if (requestMapping != null && requestMapping.value().length > 0) {
            baseUrl = requestMapping.value()[0];
        }

        // Check the path attribute
        if (baseUrl.isEmpty() && requestMapping != null && requestMapping.path().length > 0) {
            baseUrl = requestMapping.path()[0];
        }

//        log.debug("Controller: {}, BaseUrl: {}", controllerClass.getSimpleName(), baseUrl);
        return baseUrl;
    }

    /**
     * Extracts the URL pattern of the method
     */
    private String getMethodUrl(Method method, String baseUrl) {
        String methodUrl = "";

        // Process HTTP method mapping annotations
        if (method.isAnnotationPresent(RequestMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(RequestMapping.class).value());
        } else if (method.isAnnotationPresent(GetMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(GetMapping.class).value());
        } else if (method.isAnnotationPresent(PostMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(PostMapping.class).value());
        } else if (method.isAnnotationPresent(PutMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(PutMapping.class).value());
        } else if (method.isAnnotationPresent(DeleteMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(DeleteMapping.class).value());
        } else if (method.isAnnotationPresent(PatchMapping.class)) {
            methodUrl = getUrlFromAnnotation(method.getAnnotation(PatchMapping.class).value());
        }

        // Prevent duplicate slashes in the URL
        String combinedUrl = "";
        if (baseUrl.endsWith("/") && methodUrl.startsWith("/")) {
            combinedUrl = baseUrl + methodUrl.substring(1);
        } else if (!baseUrl.endsWith("/") && !methodUrl.startsWith("/") && !methodUrl.isEmpty()) {
            combinedUrl = baseUrl + "/" + methodUrl;
        } else {
            combinedUrl = baseUrl + methodUrl;
        }

        // Add leading slash if not present
        if (!combinedUrl.startsWith("/")) {
            combinedUrl = "/" + combinedUrl;
        }

        return combinedUrl;
    }

    /**
     * Extracts URL from annotation value array
     */
    private String getUrlFromAnnotation(String[] values) {
        if (values == null || values.length == 0) {
            return "";
        }
        return values[0];
    }

    /**
     * Extracts the HTTP method type
     */
    private String getHttpMethod(Method method) {
        if (method.isAnnotationPresent(GetMapping.class)) {
            return "GET";
        }
        if (method.isAnnotationPresent(PostMapping.class)) {
            return "POST";
        }
        if (method.isAnnotationPresent(PutMapping.class)) {
            return "PUT";
        }
        if (method.isAnnotationPresent(DeleteMapping.class)) {
            return "DELETE";
        }
        if (method.isAnnotationPresent(PatchMapping.class)) {
            return "PATCH";
        }

        if (method.isAnnotationPresent(RequestMapping.class)) {
            RequestMapping mapping = method.getAnnotation(RequestMapping.class);
            if (mapping.method().length > 0) {
                return mapping.method()[0].name();
            }
        }

        return null;
    }

    /**
     * Creates endpoint information including request examples and parameter details.
     * Analyzes controller methods to extract:
     * - URL patterns
     * - HTTP methods
     * - Request/Response types
     * - Request body examples
     */
    private PerformanceEndpoint createEndpoint(Class<?> controllerClass, Method method,
        String url, String httpMethod) {

        String description = Optional.ofNullable(method.getAnnotation(PerformanceMeasure.class))
            .map(PerformanceMeasure::value)
            .orElse("");

        // Analyze request body type
        Class<?> requestBodyType = null;
        for (Parameter param : method.getParameters()) {
            if (param.isAnnotationPresent(RequestBody.class)) {
                requestBodyType = param.getType();
//                log.debug("Found @RequestBody parameter of type: {}", requestBodyType.getName());
                break;
            }
        }
        if (requestBodyType == null) {
            requestBodyType = Void.class;
//            log.debug("No @RequestBody parameter found, using Void.class");
        }

        // Generate request example
        Map<String, Object> requestExample = new HashMap<>();
        if (requestBodyType != Void.class) {
//            log.debug("Generating request example for type: {}", requestBodyType.getName());
            try {
                requestExample = generateRequestExample(requestBodyType);
//                log.debug("Generated request example: {}", requestExample);
            } catch (Exception e) {
//                log.error("Failed to generate request example for {}: {}",
//                    requestBodyType.getName(),
//                    e.getMessage(),
//                    e);
            }
        }

        PerformanceEndpoint endpoint = PerformanceEndpoint.builder()
            .endpointUrl(url)
            .httpMethod(httpMethod)
            .controllerClassName(controllerClass.getSimpleName())
            .controllerMethodName(method.getName())
            .requestType(requestBodyType.getSimpleName())
            .responseType(method.getReturnType().getSimpleName())
            .description(description)
            .parameters(new HashMap<>())
            .requestExample(requestExample)
            .annotatedServices(new ArrayList<>())
            .build();

//        log.debug("Created endpoint: {}", endpoint);
        return endpoint;
    }

    /**
     * Generates example request body based on the class structure.
     * Handles various types including:
     * - Primitive types
     * - Date/Time types
     * - Collections
     * - Nested objects
     *
     * @param type The class type to generate example for
     * @return Map containing field names and example values
     */
    private Map<String, Object> generateRequestExample(Class<?> type) {
        Map<String, Object> example = new LinkedHashMap<>();

        Field[] fields = type.getDeclaredFields();
//        log.debug("Found {} fields in class", fields.length);

        for (Field field : type.getDeclaredFields()) {

            if (isAccessible(field)) {
                String fieldType = field.getType().getSimpleName();
                String fieldName = field.getName();
                Type genericType = field.getGenericType();

                Object exampleValue = switch (fieldType.toLowerCase()) {
                    // num type
                    case "byte" -> 1;
                    case "short" -> 100;
                    case "int", "integer" -> 42;
                    case "long" -> 1000L;
                    case "float" -> 3.14f;
                    case "double" -> 3.14;
                    case "bigdecimal" -> 123.456;
                    case "biginteger" -> 10000;

                    // str or char type
                    case "string" -> "string";
                    case "char", "character" -> "A";

                    // boolean
                    case "boolean", "Boolean" -> false;

                    // date/time
                    case "date" -> "2024-01-02T09:00:00.000Z";
                    case "localdate" -> "2024-01-02";
                    case "localtime" -> "09:00:30";
                    case "localdatetime" -> "2024-01-02T09:00:30";
                    case "instant" -> "2024-01-02T09:00:30.000Z";
                    case "zoneddatetime" -> "2024-01-02T09:00:30+09:00[Asia/Seoul]";
                    case "offsetdatetime" -> "2024-01-02T09:00:30+09:00";
                    case "offsettime" -> "09:00:30+09:00";
                    case "year" -> 2025;
                    case "yearmonth" -> "2024-01";
                    case "monthday" -> "--01-02";
                    case "duration" -> "PT1H30M";
                    case "period" -> "P1Y2M3D";

                    // Enum
                    case "enum" -> {
                        if (field.getType().isEnum()) {
                            Object[] enumConstants = field.getType().getEnumConstants();
                            yield enumConstants.length > 0 ? enumConstants[0].toString() : null;
                        }
                        yield null;
                    }

                    // collections
                    case "list", "arraylist", "linkedlist" -> new ArrayList<>();
                    case "set", "hashset", "treeset" -> new HashSet<>();
                    case "map", "hashmap", "treemap", "linkedhashmap" -> new HashMap<>();
                    case "queue", "deque" -> new ArrayDeque<>();

                    // arr
                    case "array" -> field.getType().isArray() ? new ArrayList<>() : null;

                    // UUID
                    case "uuid" -> "123e4567-e89b-12d3-a456-426614174000";

                    // Optional
                    case "optional" -> null;

                    // other
                    case "uri" -> "http://example.com";
                    case "url" -> "http://example.com";
                    case "file" -> "/path/to/file";
                    case "path" -> "/path/to/resource";
                    case "locale" -> "en-US";
                    case "timezone" -> "Asia/Seoul";
                    case "currency" -> "USD";

                    // collections
                    case "int[]", "integer[]", "long[]", "double[]", "string[]", "boolean[]" ->
                        createExampleArray(fieldType.toLowerCase());

                    default -> {
//                        log.debug("Using default null for type: {}", fieldType);
                        yield null;
                    }
                };// end object

                if (genericType instanceof ParameterizedType) {
                    ParameterizedType paramType = (ParameterizedType) genericType;
                    Type[] typeArguments = paramType.getActualTypeArguments();

                    if (fieldType.toLowerCase().contains("list") ||
                        fieldType.toLowerCase().contains("set")) {
                        if (typeArguments.length > 0) {
                            List<Object> list = new ArrayList<>();
                            if (typeArguments[0].equals(String.class)) {
                                list.add("example string");
                            } else if (typeArguments[0].equals(Integer.class)) {
                                list.add(42);
                            } else if (typeArguments[0].equals(Long.class)) {
                                list.add(1000L);
                            }
                            example.put(fieldName, list);
                        } else {
                            example.put(fieldName, new ArrayList<>());
                        }
                    } else if (fieldType.toLowerCase().contains("map")) {
                        if (typeArguments.length > 1) {
                            Map<Object, Object> map = new HashMap<>();
                            Object key = typeArguments[0].equals(String.class) ? "key" : 1;
                            Object value = typeArguments[1].equals(String.class) ? "value" : 42;
                            map.put(key, value);
                            example.put(fieldName, map);
                        } else {
                            example.put(fieldName, new HashMap<>());
                        }
                    }
                } else {
                    example.put(fieldName, exampleValue);
                }
            } else {
//                log.debug("Skipping field {} as it's not accessible", field.getName());
            }
        }

//        log.debug("Final example map: {}", example);
        return example;
    }

    // Check if it can be made as a field
    private boolean isAccessible(Field field) {
        // if public
        if (Modifier.isPublic(field.getModifiers())) {
            return true;
        }

        String fieldName = field.getName();
        String getterName =
            "get" + fieldName.substring(0, 1).toUpperCase() + fieldName.substring(1);
        String isGetterName =
            "is" + fieldName.substring(0, 1).toUpperCase() + fieldName.substring(1);

        try {
            // if getter exists
            return field.getDeclaringClass().getMethod(getterName) != null ||
                (field.getType() == boolean.class &&
                    field.getDeclaringClass().getMethod(isGetterName) != null);
        } catch (NoSuchMethodException e) {
            // check Lombok
            return Arrays.stream(field.getDeclaringClass().getAnnotations())
                .anyMatch(a -> {
                    String name = a.annotationType().getSimpleName();
                    return name.equals("Getter") || name.equals("Data");
                });
        }
    }

    private List<Object> createExampleArray(String type) {
        switch (type) {
            case "int[]":
            case "integer[]":
                return Arrays.asList(1, 2, 3);
            case "long[]":
                return Arrays.asList(1L, 2L, 3L);
            case "double[]":
                return Arrays.asList(1.0, 2.0, 3.0);
            case "string[]":
                return Arrays.asList("a", "b", "c");
            case "boolean[]":
                return Arrays.asList(true, false);
            default:
                return new ArrayList<>();
        }
    }

}