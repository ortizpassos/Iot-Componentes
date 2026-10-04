FROM eclipse-temurin:17-jre
WORKDIR /app
COPY target/email-service-0.0.1.jar app.jar
EXPOSE 3002
ENTRYPOINT ["java","-jar","/app/app.jar"]
