package com.monitorellas.mq;

import com.monitorellas.mail.MailService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Map;

@Component
public class EmailListener {

    private final MailService mailService;

    @Value("${spring.application.name}")
    private String appName;

    public EmailListener(MailService mailService) {
        this.mailService = mailService;
    }

    @RabbitListener(queues = "email.outbox")
    public void onOperacaoCreated(@Payload Map<String, Object> payload) {
        String type = (String) payload.get("type");
        if (type == null) return;
        switch (type) {
                case "email.verificacao" -> handleEmailVerificacao(payload);
                case "comunicado.criado" -> handleComunicadoCriado(payload);
                case "decisao.criada"    -> handleDecisaoCriada(payload);
                case "notificacao.manual" -> handleNotificacaoManual(payload);
            default -> {
            }
        }
    }

            private void handleNotificacaoManual(Map<String, Object> payload) {
            String to = (String) payload.get("emailNotificacao");
            if (to == null || to.isBlank()) return;

            String titulo = (String) payload.getOrDefault("titulo", "Notificação");
            String mensagem = (String) payload.getOrDefault("mensagem", "");
            String destinatario = (String) payload.getOrDefault("destinatario", "colaborador");

            String subject = "Bridge Flow - Nova Notificação: " + titulo;
            String body = String.format(
                "Olá %s,\n\n" +
                    "Você recebeu uma nova notificação no Bridge Flow.\n\n" +
                    "Título: %s\n" +
                    "Mensagem:\n%s\n\n" +
                    "Acesse a plataforma para mais detalhes.\n\n" +
                    "Equipe Bridge Flow",
                destinatario != null && !destinatario.isBlank() ? destinatario : "",
                titulo,
                mensagem
            );

            mailService.send(to, subject, body);
            }

    private void handleDecisaoCriada(Map<String, Object> payload) {
        String to = (String) payload.get("emailNotificacao");
        if (to == null || to.isBlank()) return;

        String decisaoTitulo = (String) payload.get("decisaoTitulo");
        String responsavelNome = (String) payload.get("responsavelNome");
        String prazo = (String) payload.get("prazo");

        String subject = "Bridge Flow - Nova Decisão Criada: " + decisaoTitulo;
        String body = String.format(
            "Olá,\n\nUma nova decisão foi criada no sistema Bridge Flow.\n\n" +
                        "Título: %s\n" +
                        "Responsável: %s\n" +
                        "Prazo: %s\n\n" +
                        "Acesse a plataforma para mais detalhes.\n\n" +
                "Equipe Bridge Flow",
                decisaoTitulo, responsavelNome, prazo
        );
        mailService.send(to, subject, body);
    }

    private void handleComunicadoCriado(Map<String, Object> payload) {
        String to = (String) payload.get("emailNotificacao");
        if (to == null || to.isBlank()) return;

        String comunicadoTitulo = (String) payload.get("comunicadoTitulo");
        String comunicadoConteudo = (String) payload.get("comunicadoConteudo");
        String remetente = (String) payload.get("remetente");
        String destinatario = (String) payload.get("destinatario");
        String prioridade = (String) payload.get("comunicadoPrioridade");
        String prioridadeLabel = humanizeEnum(prioridade);

        String subject = "Bridge Flow - Novo Comunicado: " + comunicadoTitulo;
        String body = String.format(
            "Olá,\n\nUm novo comunicado foi registrado no sistema Bridge Flow.\n\n" +
                        "Título: %s\n" +
                        "Prioridade: %s\n" +
                        "De: %s\n" +
                "Para: %s\n\n" +
                "Conteúdo:\n%s\n\n" +
                "Acesse a plataforma para mais detalhes.\n\n" +
                "Equipe Bridge Flow",
            comunicadoTitulo,
                prioridadeLabel,
            remetente,
            destinatario,
            comunicadoConteudo != null ? comunicadoConteudo : ""
        );
        mailService.send(to, subject, body);
    }

    private String humanizeEnum(String value) {
        if (value == null || value.isBlank()) {
            return "N/A";
        }
        String lower = value.toLowerCase(Locale.ROOT);
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private void handleEmailVerificacao(Map<String, Object> payload) {
        String to = (String) payload.get("usuarioEmail");
        if (to == null || to.isBlank()) return;
        String codigo = (String) payload.get("codigo");
        String expiresAt = (String) payload.get("expiresAt");
        String subject = "Bridge Flow - Verificação de e-mail";
        String body = "Olá,\n\n" +
                "Recebemos seu cadastro. Para ativar sua conta, utilize o código abaixo:\n\n" +
                "Código: " + codigo + "\n\n" +
                "Este código expira em: " + expiresAt + " (30 minutos).\n" +
                "Se você não solicitou este cadastro, ignore este e-mail.\n\n" +
            "Equipe Bridge Flow" + "\n";
        mailService.send(to, subject, body);
    }
}
