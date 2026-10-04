package com.monitorellas.mail;


import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import java.time.OffsetDateTime;

@Service
public class MailService {

    private final JavaMailSender mailSender;
    private final EmailLogRepository emailLogRepository;

    @Value("${app.mail.from}")
    private String from;

    public MailService(JavaMailSender mailSender, EmailLogRepository emailLogRepository) {
        this.mailSender = mailSender;
        this.emailLogRepository = emailLogRepository;
    }

    public void send(String to, String subject, String body) {
        boolean success = false;
        String error = null;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            success = true;
        } catch (Exception ex) {
            error = ex.getMessage();
        }
        emailLogRepository.save(java.util.Objects.requireNonNull(EmailLog.builder()
            .recipient(to)
            .subject(subject)
            .body(body)
            .sentAt(OffsetDateTime.now())
            .success(success)
            .error(error)
            .build()));
        if (!success) throw new RuntimeException("Falha ao enviar e-mail: " + error);
    }
}

