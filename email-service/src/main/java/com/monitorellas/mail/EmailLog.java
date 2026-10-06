package com.monitorellas.mail;

import lombok.*;
import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "email_logs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EmailLog {
    @Id
    private String id;

    private String recipient;
    private String subject;
    private String body;
    private Instant sentAt;
    private boolean success;
    private String error;
}
