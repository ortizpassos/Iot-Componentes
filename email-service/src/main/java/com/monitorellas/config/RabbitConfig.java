package com.monitorellas.config;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.DefaultJackson2JavaTypeMapper;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {
    @Bean
    public DirectExchange bridgeflowExchange() {
        return new DirectExchange("bridgeflow.exchange", true, false);
    }
    @Bean
    public Queue emailOutboxQueue() {
        return new Queue("email.outbox", true);
    }

    @Bean
    public Binding emailOutboxBinding(Queue emailOutboxQueue, DirectExchange bridgeflowExchange) {
        return BindingBuilder.bind(emailOutboxQueue).to(bridgeflowExchange).with("bridgeflow.routingkey");
    }


    @Bean
    public MessageConverter messageConverter() {
        Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter();
        DefaultJackson2JavaTypeMapper typeMapper = new DefaultJackson2JavaTypeMapper();
        typeMapper.setTrustedPackages("*"); // Allow all packages
        converter.setJavaTypeMapper(typeMapper);
        return converter;
    }
}
