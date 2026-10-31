package com.campusradar;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
public class CampusRadarApplication {
    public static void main(String[] args) {
        SpringApplication.run(CampusRadarApplication.class, args);
    }
}
