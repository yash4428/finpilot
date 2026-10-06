package com.finpilot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FinPilotApplication {
    public static void main(String[] args) {
        SpringApplication.run(FinPilotApplication.class, args);
    }
}
