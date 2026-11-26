-- Идемпотентная инициализация схем PostgreSQL 17 (таблицы и индексы создаются при старте backend)
CREATE SCHEMA IF NOT EXISTS oltp;
CREATE SCHEMA IF NOT EXISTS outbox;
