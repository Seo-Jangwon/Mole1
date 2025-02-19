/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

//package com.monitor.annotation.test;
//
//import com.monitor.annotation.annotation.PerformanceMeasure;
//import org.springframework.web.bind.annotation.GetMapping;
//import org.springframework.web.bind.annotation.PostMapping;
//import org.springframework.web.bind.annotation.RequestBody;
//import org.springframework.web.bind.annotation.RequestMapping;
//import org.springframework.web.bind.annotation.RestController;
//
//@RestController
//@RequestMapping("/api/test")
//public class TestController {
//
//    @PerformanceMeasure("Simple API test")
//    @GetMapping("/simple")
//    public String simpleTest() {
//        return "Hello World";
//    }
//
//    @PerformanceMeasure("Slow API test")
//    @GetMapping("/slow")
//    public String slowTest() throws InterruptedException {
//        Thread.sleep(1000);
//        return "Slow Response";
//    }
//
//    @PerformanceMeasure("Heavy memory API test")
//    @GetMapping("/memory")
//    public String memoryTest() {
//        StringBuilder sb = new StringBuilder();
//        for (int i = 0; i < 100_000; i++) {
//            sb.append("test data ");
//        }
//        return "Memory Test Complete";
//    }
//
//    @PerformanceMeasure("Post test")
//    @PostMapping("/post1")
//    public TestDto post(@RequestBody TestDto testDto) {
//        return testDto;
//    }
//}