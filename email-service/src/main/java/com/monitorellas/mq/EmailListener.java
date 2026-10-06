package com.monitorellas.mq;

import com.monitorellas.mail.MailService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;

@Component
public class EmailListener {
    private final MailService mailService;
    public EmailListener(MailService mailService) { this.mailService = mailService; }

    @RabbitListener(queues = "${app.mq.queue}")
    public void receive(@Payload Map<String, Object> payload) {
        switch (text(payload, "type")) {
            case "customer.registered" -> registered(payload);
            case "order.paid" -> paid(payload);
            case "order.shipped" -> shipped(payload);
            default -> { }
        }
    }

    private void registered(Map<String, Object> payload) {
        mailService.send(required(payload, "email"), "Bem-vindo à IoT Componentes",
            "Olá, " + customer(text(payload, "name")) + "!\n\nSua conta na IoT Componentes foi criada com sucesso.\n\n" +
            "Você já pode acompanhar pedidos e acessar seus projetos no Meu Lab.\n\nEquipe IoT Componentes");
    }

    private void paid(Map<String, Object> payload) {
        String orderId = required(payload, "orderId");
        mailService.send(required(payload, "email"), "Pagamento confirmado — pedido #" + shortId(orderId),
            "Olá, " + customer(text(payload, "name")) + "!\n\nConfirmamos o pagamento do pedido #" + shortId(orderId) + ".\n" +
            "Total: " + currency(payload.get("total")) + "\n\nProjetos digitais já estão disponíveis no Meu Lab. " +
            "Para produtos físicos, avisaremos quando o pedido for enviado.\n\nEquipe IoT Componentes");
    }

    private void shipped(Map<String, Object> payload) {
        String orderId = required(payload, "orderId");
        String tracking = required(payload, "trackingCode").toUpperCase(Locale.ROOT);
        mailService.send(required(payload, "email"), "Pedido enviado — #" + shortId(orderId),
            "Olá, " + customer(text(payload, "name")) + "!\n\nSeu pedido #" + shortId(orderId) + " foi enviado.\n\n" +
            "Código de rastreamento: " + tracking + "\nAcompanhe a entrega: " +
            "https://rastreamento.correios.com.br/app/index.php?objetos=" + tracking + "\n\nEquipe IoT Componentes");
    }

    private String required(Map<String, Object> payload, String key) {
        String value = text(payload, key);
        if (value.isBlank()) throw new IllegalArgumentException("Campo obrigatório ausente: " + key);
        return value;
    }
    private String text(Map<String, Object> payload, String key) { Object value = payload.get(key); return value == null ? "" : String.valueOf(value).trim(); }
    private String customer(String name) { return name.isBlank() ? "cliente" : name; }
    private String shortId(String id) { return id.length() <= 8 ? id : id.substring(id.length() - 8); }
    private String currency(Object value) {
        try { return NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR")).format(new BigDecimal(String.valueOf(value))); }
        catch (Exception ignored) { return "valor confirmado"; }
    }
}
