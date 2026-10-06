FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /source
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /source/target/email-service-0.0.1.jar app.jar
EXPOSE 3002
ENTRYPOINT ["java","-jar","/app/app.jar"]
