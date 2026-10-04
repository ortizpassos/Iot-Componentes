package com.monitorellas.mail;

import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/email-logs")
public class EmailLogController {
    private final EmailLogRepository repo;
    public EmailLogController(EmailLogRepository repo) { this.repo = repo; }

    @GetMapping
    public List<EmailLog> listAll() {
        return repo.findAll();
    }
}
