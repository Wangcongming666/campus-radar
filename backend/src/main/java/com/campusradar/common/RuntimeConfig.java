package com.campusradar.common;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RuntimeConfig {
    @Bean Clock clock() { return Clock.systemUTC(); }
}
