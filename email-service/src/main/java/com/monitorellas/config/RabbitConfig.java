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
import org.springframework.beans.factory.annotation.Value;

@Configuration
public class RabbitConfig {
    @Value("${app.mq.exchange}") private String exchange;
    @Value("${app.mq.queue}") private String queue;
    @Value("${app.mq.routing-key}") private String routingKey;
    @Bean
    public DirectExchange bridgeflowExchange() {
        return new DirectExchange(exchange, true, false);
    }
    @Bean
    public Queue emailOutboxQueue() {
        return new Queue(queue, true);
    }

    @Bean
    public Binding emailOutboxBinding(Queue emailOutboxQueue, DirectExchange bridgeflowExchange) {
        return BindingBuilder.bind(emailOutboxQueue).to(bridgeflowExchange).with(routingKey);
    }


    @Bean
    public MessageConverter messageConverter() {
        Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter();
        DefaultJackson2JavaTypeMapper typeMapper = new DefaultJackson2JavaTypeMapper();
        typeMapper.setTrustedPackages("java.util", "java.lang");
        converter.setJavaTypeMapper(typeMapper);
        return converter;
    }
}
