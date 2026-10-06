package com.monitorellas.mail;

import org.springframework.web.bind.annotation.*;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/email-logs")
public class EmailLogController {
    private final EmailLogRepository repo;
    @Value("${app.logs.token}") private String token;
    public EmailLogController(EmailLogRepository repo) { this.repo = repo; }

    @GetMapping
    public List<EmailLog> listAll(@RequestHeader(value = "X-Email-Log-Token", required = false) String suppliedToken) {
        if (token.isBlank() || !token.equals(suppliedToken)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return repo.findAll();
    }
}
