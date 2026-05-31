-- SwiftCare MySQL Schema
-- Run this file once: mysql -u root -p swiftcare < backend/db/schema.sql

CREATE DATABASE IF NOT EXISTS swiftcare;
USE swiftcare;

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    password      VARCHAR(255)  NOT NULL,
    role          ENUM('patient','doctor','admin','driver','user') NOT NULL DEFAULT 'user',
    mobile_number VARCHAR(20)   DEFAULT NULL,
    specialization VARCHAR(100) DEFAULT NULL,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ambulances (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    ambulance_name VARCHAR(100)  NOT NULL UNIQUE,
    hospital_name  VARCHAR(150)  NOT NULL,
    driver_email   VARCHAR(150)  NOT NULL UNIQUE,
    driver_name    VARCHAR(100)  DEFAULT NULL,
    driver_phone   VARCHAR(20)   DEFAULT NULL,
    available      TINYINT(1)    NOT NULL DEFAULT 1,
    location       VARCHAR(255)  NOT NULL,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    patient_email    VARCHAR(150) NOT NULL,
    patient_name     VARCHAR(100) DEFAULT NULL,
    patient_mobile   VARCHAR(20)  DEFAULT NULL,
    patient_location VARCHAR(255) NOT NULL,
    emergency_type   VARCHAR(100) DEFAULT NULL,
    ambulance_id     INT          DEFAULT NULL,
    ambulance_name   VARCHAR(100) DEFAULT NULL,
    driver_name      VARCHAR(100) DEFAULT NULL,
    driver_phone     VARCHAR(20)  DEFAULT NULL,
    driver_email     VARCHAR(150) DEFAULT NULL,
    hospital_name    VARCHAR(150) DEFAULT NULL,
    status           ENUM('pending','assigned','en-route','arrived','completed','cancelled') NOT NULL DEFAULT 'pending',
    assigned_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    patient_email  VARCHAR(150) NOT NULL,
    conversation   JSON         NOT NULL,
    final_summary  TEXT         NOT NULL,
    status         ENUM('draft','final','reviewed') NOT NULL DEFAULT 'final',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed ambulances
INSERT IGNORE INTO ambulances
    (ambulance_name, hospital_name, driver_email, driver_name, driver_phone, available, location)
VALUES
    ('SwiftCare-01', 'City General Hospital', 'driver1@swiftcare.com', 'Driver 1', '87541265',   1, '12.910, 77.640'),
    ('SwiftCare-02', 'Metro Care Hospital',   'driver2@swiftcare.com', 'Driver 2', '7788994425', 1, '12.920, 77.650');
