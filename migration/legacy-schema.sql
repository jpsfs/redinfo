-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: srv1147.hstgr.io    Database: u127939263_cvp
-- ------------------------------------------------------
-- Server version	11.8.8-MariaDB-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `u127939263_cvp`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `u127939263_cvp` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `u127939263_cvp`;

--
-- Table structure for table `Areas_Freguesias_CAOP2015`
--

DROP TABLE IF EXISTS `Areas_Freguesias_CAOP2015`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Areas_Freguesias_CAOP2015` (
  `Distrito` varchar(29) DEFAULT NULL,
  `Concelho` varchar(27) DEFAULT NULL,
  `Freguesia` varchar(143) DEFAULT NULL,
  UNIQUE KEY `idx_contatos` (`Distrito`,`Concelho`,`Freguesia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Material`
--

DROP TABLE IF EXISTS `Material`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Material` (
  `Ambulancia` int(3) NOT NULL,
  `Descricao` varchar(100) NOT NULL,
  `validade` date NOT NULL,
  `Quantidade` int(11) DEFAULT NULL,
  `Quantidade_minima` int(11) DEFAULT NULL,
  `Tipo` varchar(30) NOT NULL,
  `Status` varchar(5) NOT NULL DEFAULT 'OP',
  `aviso` varchar(500) DEFAULT NULL,
  `Imagem` varchar(5000) NOT NULL,
  `preco_unitario` int(11) NOT NULL,
  PRIMARY KEY (`Ambulancia`,`Descricao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `abertura_disponibilidade`
--

DROP TABLE IF EXISTS `abertura_disponibilidade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `abertura_disponibilidade` (
  `data_inicio` date NOT NULL,
  `status` varchar(11) NOT NULL,
  `id` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `aceitacao_termos`
--

DROP TABLE IF EXISTS `aceitacao_termos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aceitacao_termos` (
  `titulo` varchar(150) NOT NULL,
  `versao` int(11) NOT NULL,
  `user` varchar(50) NOT NULL,
  `data_aceitacao` datetime NOT NULL,
  PRIMARY KEY (`titulo`,`versao`,`user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ajudas_tecnicas`
--

DROP TABLE IF EXISTS `ajudas_tecnicas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ajudas_tecnicas` (
  `nome` varchar(100) NOT NULL,
  `descricao` varchar(500) NOT NULL,
  `inicio_processo` date NOT NULL,
  `data_entrega` date NOT NULL,
  `data_recebimento` date NOT NULL,
  `fim_processo` date NOT NULL,
  `pagamento` int(11) NOT NULL,
  `estado` varchar(50) NOT NULL,
  `artigo` varchar(500) NOT NULL,
  `cartao_cidadao` int(11) NOT NULL,
  `preco_combinado` int(11) NOT NULL,
  `socorrista` varchar(5) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `alteracoes_escala`
--

DROP TABLE IF EXISTS `alteracoes_escala`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alteracoes_escala` (
  `time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `socorrista` int(11) NOT NULL,
  `dia` int(11) NOT NULL,
  `mes` int(11) NOT NULL,
  `ano` int(11) NOT NULL,
  `turno` int(11) NOT NULL,
  `funcao` varchar(20) NOT NULL,
  `acao` varchar(20) NOT NULL,
  `estado` varchar(20) NOT NULL,
  PRIMARY KEY (`time`,`socorrista`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ambulancias`
--

DROP TABLE IF EXISTS `ambulancias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ambulancias` (
  `n_regional` varchar(20) NOT NULL,
  `matricula` varchar(15) NOT NULL,
  `descricao` varchar(200) DEFAULT NULL,
  `seguro` date DEFAULT NULL,
  `nome_seguro` varchar(200) NOT NULL,
  `inspecao` date DEFAULT NULL,
  `inem` date NOT NULL,
  `tipo` varchar(5) NOT NULL,
  `imagem` varchar(500) DEFAULT NULL,
  `created_by` varchar(20) DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `updated_by` varchar(20) DEFAULT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`n_regional`),
  KEY `tipo` (`tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ambulancias_hist`
--

DROP TABLE IF EXISTS `ambulancias_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ambulancias_hist` (
  `n_regional` varchar(20) NOT NULL,
  `matricula` varchar(15) DEFAULT NULL,
  `descricao` varchar(200) DEFAULT NULL,
  `seguro` date DEFAULT NULL,
  `nome_seguro` varchar(200) DEFAULT NULL,
  `inspecao` date DEFAULT NULL,
  `inem` date DEFAULT NULL,
  `tipo` varchar(5) DEFAULT NULL,
  `imagem` varchar(500) DEFAULT NULL,
  `created_by` varchar(20) DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `updated_by` varchar(20) DEFAULT NULL,
  `update_date` datetime NOT NULL,
  `operacao` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`n_regional`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `apoio_inem`
--

DROP TABLE IF EXISTS `apoio_inem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `apoio_inem` (
  `id` varchar(5) NOT NULL,
  `descricao` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `avaliacoes_saida`
--

DROP TABLE IF EXISTS `avaliacoes_saida`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `avaliacoes_saida` (
  `id` int(11) NOT NULL,
  `ano` int(11) NOT NULL,
  `avaliacao` int(11) NOT NULL,
  `sistolica` int(11) NOT NULL,
  `diastolica` int(11) NOT NULL,
  `spo2` int(11) NOT NULL,
  `temperatura` int(11) NOT NULL,
  `dx` int(11) NOT NULL,
  `medicacao` varchar(500) NOT NULL,
  `antecedentes` varchar(1000) NOT NULL,
  `queixas` varchar(1000) NOT NULL,
  `O2` int(11) DEFAULT NULL,
  `ultima_refeicao` time NOT NULL,
  `outros` varchar(10000) NOT NULL,
  PRIMARY KEY (`id`,`ano`,`avaliacao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `avisos`
--

DROP TABLE IF EXISTS `avisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `avisos` (
  `tipo` varchar(50) NOT NULL,
  `titulo` varchar(100) NOT NULL,
  `descricao` varchar(5000) NOT NULL,
  `para` varchar(100) NOT NULL,
  `validade` date NOT NULL,
  `cor` varchar(50) NOT NULL,
  `visto` varchar(1000) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`tipo`,`titulo`,`para`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat`
--

DROP TABLE IF EXISTS `chat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat` (
  `de` varchar(11) NOT NULL,
  `para` varchar(11) NOT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `mensagem` varchar(5000) NOT NULL,
  `cod` varchar(20) NOT NULL,
  `assunto` varchar(100) NOT NULL,
  `info` varchar(50) NOT NULL,
  PRIMARY KEY (`cod`),
  UNIQUE KEY `de` (`de`,`para`,`data`,`hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `disponibilidade`
--

DROP TABLE IF EXISTS `disponibilidade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disponibilidade` (
  `ano` year(4) NOT NULL,
  `mes` int(2) NOT NULL,
  `dia` int(2) NOT NULL,
  `turno` int(11) NOT NULL,
  `socorrista` int(11) NOT NULL,
  PRIMARY KEY (`ano`,`mes`,`dia`,`turno`,`socorrista`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `escala`
--

DROP TABLE IF EXISTS `escala`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `escala` (
  `mes` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `condutor` int(11) NOT NULL,
  `socorrista_1` int(11) NOT NULL,
  `socorrista_3` int(11) NOT NULL,
  `trocas` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `turno` int(11) NOT NULL,
  `ano` int(11) NOT NULL,
  `dia` int(11) NOT NULL,
  `observacoes` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `dia_semana` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `update_date` datetime NOT NULL,
  `updated_by` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`mes`,`turno`,`ano`,`dia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `escala_hist`
--

DROP TABLE IF EXISTS `escala_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `escala_hist` (
  `mes` varchar(20) NOT NULL,
  `condutor` int(11) NOT NULL,
  `socorrista_1` int(11) NOT NULL,
  `socorrista_3` int(11) NOT NULL,
  `trocas` varchar(200) NOT NULL,
  `turno` int(11) NOT NULL,
  `ano` int(11) NOT NULL,
  `dia` int(11) NOT NULL,
  `observacoes` varchar(100) NOT NULL,
  `dia_semana` varchar(50) NOT NULL,
  `update_date` datetime NOT NULL,
  `updated_by` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`mes`,`turno`,`ano`,`dia`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `funcao`
--

DROP TABLE IF EXISTS `funcao`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `funcao` (
  `id` varchar(5) NOT NULL,
  `descricao` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `habilitações`
--

DROP TABLE IF EXISTS `habilitações`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `habilitações` (
  `descricao` varchar(100) NOT NULL,
  `outro` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`descricao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `horas_voluntariado`
--

DROP TABLE IF EXISTS `horas_voluntariado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `horas_voluntariado` (
  `socorrista` int(11) NOT NULL,
  `data` date NOT NULL DEFAULT '0000-00-00',
  `hora_inicio` time NOT NULL,
  `hora_fim` time NOT NULL,
  `horas` time NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `descricao` varchar(150) NOT NULL,
  `info` varchar(200) NOT NULL,
  `codigo` varchar(100) NOT NULL,
  `explicacao` varchar(500) NOT NULL,
  PRIMARY KEY (`socorrista`,`data`,`hora_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `info_atualizacoes`
--

DROP TABLE IF EXISTS `info_atualizacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `info_atualizacoes` (
  `data` timestamp NOT NULL DEFAULT current_timestamp(),
  `versao` int(11) NOT NULL AUTO_INCREMENT,
  `descricao` varchar(5000) NOT NULL,
  PRIMARY KEY (`versao`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `material_outro`
--

DROP TABLE IF EXISTS `material_outro`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_outro` (
  `id` int(11) NOT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `motivo` varchar(100) NOT NULL,
  `observações` varchar(500) NOT NULL,
  PRIMARY KEY (`id`,`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `material_saida`
--

DROP TABLE IF EXISTS `material_saida`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_saida` (
  `id` varchar(4) NOT NULL,
  `ano` year(4) NOT NULL,
  `material` varchar(100) NOT NULL,
  `quantidade` int(50) NOT NULL,
  `ambulancia` int(5) NOT NULL,
  `Outro` varchar(4) NOT NULL DEFAULT 'não',
  `updated_by` varchar(11) NOT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`id`,`ano`,`material`,`ambulancia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `material_saida_hist`
--

DROP TABLE IF EXISTS `material_saida_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_saida_hist` (
  `id` varchar(4) NOT NULL,
  `ano` year(4) NOT NULL,
  `material` varchar(100) NOT NULL,
  `quantidade` int(50) NOT NULL,
  `ambulancia` int(5) NOT NULL,
  `Outro` varchar(4) DEFAULT NULL,
  `updated_by` varchar(11) NOT NULL,
  `update_date` datetime NOT NULL,
  `operacao` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`,`ano`,`material`,`ambulancia`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `recuperar`
--

DROP TABLE IF EXISTS `recuperar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recuperar` (
  `id` int(11) NOT NULL,
  `codigo` varchar(100) NOT NULL,
  PRIMARY KEY (`id`,`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `regeitadas`
--

DROP TABLE IF EXISTS `regeitadas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `regeitadas` (
  `id` int(11) NOT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `motivo` varchar(100) DEFAULT NULL,
  `observacoes` varchar(500) DEFAULT NULL,
  `registo` varchar(4) NOT NULL,
  PRIMARY KEY (`data`,`hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `saidas`
--

DROP TABLE IF EXISTS `saidas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saidas` (
  `id` int(4) NOT NULL,
  `ano` year(4) NOT NULL,
  `estado` varchar(50) NOT NULL,
  `data` date NOT NULL,
  `tipo_ocorrencia` varchar(5) NOT NULL,
  `ambulancia` int(3) NOT NULL,
  `ficha_codu` int(8) DEFAULT NULL,
  `idade_AM` varchar(5) DEFAULT 'Anos',
  `idade` int(2) DEFAULT NULL,
  `sexo` varchar(10) DEFAULT NULL,
  `h_chamada` time NOT NULL,
  `hcl` time NOT NULL,
  `hsl` time DEFAULT NULL,
  `hch` time DEFAULT NULL,
  `quilometros` int(3) NOT NULL,
  `descricao` longtext NOT NULL,
  `contacto` int(11) NOT NULL,
  `tipo_local` varchar(5) NOT NULL,
  `freguesia` varchar(50) NOT NULL,
  `inem` varchar(5) NOT NULL,
  `transporte` varchar(5) NOT NULL,
  `condutor` int(5) NOT NULL,
  `socorrista1` int(5) NOT NULL,
  `socorrista2` int(5) NOT NULL,
  `hd` time NOT NULL,
  `created_by` varchar(10) NOT NULL,
  `create_date` datetime NOT NULL,
  `updated_by` varchar(10) NOT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`id`,`ano`),
  KEY `idx_freguesia` (`freguesia`),
  KEY `idx_condutor` (`condutor`),
  KEY `idx_socorrista1` (`socorrista1`) USING BTREE,
  KEY `idx_tipo_ocorrencia` (`tipo_ocorrencia`) USING BTREE,
  KEY `idx_socorrista2` (`socorrista2`),
  KEY `idx_transporte` (`transporte`),
  KEY `idx_tipo_local` (`tipo_local`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `saidas_hist`
--

DROP TABLE IF EXISTS `saidas_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saidas_hist` (
  `id` int(4) NOT NULL,
  `ano` year(4) NOT NULL,
  `estado` varchar(50) DEFAULT NULL,
  `data` date DEFAULT NULL,
  `tipo_ocorrencia` varchar(5) DEFAULT NULL,
  `ambulancia` int(3) DEFAULT NULL,
  `ficha_codu` int(8) DEFAULT NULL,
  `idade_AM` varchar(5) DEFAULT NULL,
  `idade` int(2) DEFAULT NULL,
  `sexo` varchar(10) DEFAULT NULL,
  `h_chamada` time DEFAULT NULL,
  `hcl` time DEFAULT NULL,
  `hsl` time DEFAULT NULL,
  `hch` time DEFAULT NULL,
  `quilometros` int(3) DEFAULT NULL,
  `descricao` longtext DEFAULT NULL,
  `contacto` int(11) DEFAULT NULL,
  `tipo_local` varchar(5) DEFAULT NULL,
  `freguesia` varchar(50) DEFAULT NULL,
  `inem` varchar(5) DEFAULT NULL,
  `transporte` varchar(5) DEFAULT NULL,
  `condutor` int(5) DEFAULT NULL,
  `socorrista1` int(5) DEFAULT NULL,
  `socorrista2` int(5) DEFAULT NULL,
  `hd` time DEFAULT NULL,
  `created_by` varchar(10) DEFAULT NULL,
  `create_date` datetime DEFAULT NULL,
  `updated_by` varchar(10) DEFAULT NULL,
  `update_date` datetime NOT NULL,
  `operacao` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`,`ano`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `social`
--

DROP TABLE IF EXISTS `social`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `social` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tipo` varchar(200) NOT NULL,
  `quem_pediu` varchar(500) NOT NULL,
  `para_quem` varchar(500) NOT NULL,
  `sexo` varchar(100) NOT NULL,
  `idade` int(11) NOT NULL,
  `data` date NOT NULL,
  `hora_pedido` time NOT NULL,
  `hora_fim` time NOT NULL,
  `data_fim` date NOT NULL,
  `resolucao` varchar(5000) NOT NULL,
  `descricao` varchar(5000) NOT NULL,
  `voluntarios` varchar(5000) NOT NULL,
  `estado` varchar(100) NOT NULL,
  `morada` varchar(500) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `socorrista`
--

DROP TABLE IF EXISTS `socorrista`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `socorrista` (
  `numero` int(5) NOT NULL,
  `imagem` varchar(500) NOT NULL,
  `sangue` varchar(3) NOT NULL,
  `dae` int(5) DEFAULT NULL,
  `n_tripulante` int(11) DEFAULT NULL,
  `nome` varchar(100) NOT NULL,
  `nascimento` date NOT NULL,
  `juramento` date DEFAULT NULL,
  `contacto` int(5) DEFAULT NULL,
  `contacto2` int(5) DEFAULT NULL,
  `sexo` varchar(10) NOT NULL,
  `curso_tripulante` varchar(5) DEFAULT 'tat',
  `habilitacoes` varchar(100) DEFAULT NULL,
  `curso` varchar(100) DEFAULT NULL,
  `num_curso` int(11) DEFAULT NULL,
  `estado_civil` varchar(30) DEFAULT NULL,
  `n_carta` varchar(11) DEFAULT NULL,
  `data_validade_carta` date DEFAULT NULL,
  `data_bi` date DEFAULT NULL,
  `bi` int(11) DEFAULT NULL,
  `data_ta` date DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `rua` varchar(100) DEFAULT NULL,
  `cidade` varchar(70) DEFAULT NULL,
  `freguesia` varchar(70) DEFAULT NULL,
  `cod_postal` varchar(8) DEFAULT NULL,
  `grupo_ii` varchar(5) DEFAULT NULL,
  `validade_grupoII` varchar(11) DEFAULT NULL,
  `nif` int(11) DEFAULT NULL,
  `numero_porta` int(11) DEFAULT NULL,
  `n_cvp` int(11) DEFAULT NULL,
  `tem_carta` int(11) DEFAULT NULL,
  `data_inicio_carta` date DEFAULT NULL,
  `estado` varchar(100) DEFAULT NULL,
  `profissao` varchar(50) DEFAULT NULL,
  `updated_by` varchar(11) NOT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`numero`),
  KEY `sexo` (`sexo`),
  KEY `funcao` (`curso_tripulante`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `socorrista_hist`
--

DROP TABLE IF EXISTS `socorrista_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `socorrista_hist` (
  `numero` int(5) NOT NULL,
  `imagem` varchar(500) DEFAULT NULL,
  `sangue` varchar(3) DEFAULT NULL,
  `dae` int(5) DEFAULT NULL,
  `n_tripulante` int(11) DEFAULT NULL,
  `nome` varchar(100) DEFAULT NULL,
  `nascimento` date DEFAULT NULL,
  `juramento` date DEFAULT NULL,
  `contacto` int(5) DEFAULT NULL,
  `contacto2` int(5) DEFAULT NULL,
  `sexo` varchar(10) DEFAULT NULL,
  `curso_tripulante` varchar(5) DEFAULT NULL,
  `habilitacoes` varchar(100) DEFAULT NULL,
  `curso` varchar(100) DEFAULT NULL,
  `num_curso` int(11) DEFAULT NULL,
  `estado_civil` varchar(30) DEFAULT NULL,
  `n_carta` varchar(11) DEFAULT NULL,
  `data_validade_carta` date DEFAULT NULL,
  `data_bi` date DEFAULT NULL,
  `bi` int(11) DEFAULT NULL,
  `data_ta` date DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `rua` varchar(100) DEFAULT NULL,
  `cidade` varchar(70) DEFAULT NULL,
  `freguesia` varchar(70) DEFAULT NULL,
  `cod_postal` varchar(8) DEFAULT NULL,
  `grupo_ii` varchar(5) DEFAULT NULL,
  `validade_grupoII` varchar(11) DEFAULT NULL,
  `nif` int(11) DEFAULT NULL,
  `numero_porta` int(11) DEFAULT NULL,
  `n_cvp` int(11) DEFAULT NULL,
  `tem_carta` int(11) DEFAULT NULL,
  `data_inicio_carta` date DEFAULT NULL,
  `estado` varchar(100) DEFAULT NULL,
  `profissao` varchar(50) DEFAULT NULL,
  `updated_by` varchar(11) DEFAULT NULL,
  `update_date` datetime NOT NULL,
  `operacao` varchar(20) NOT NULL,
  PRIMARY KEY (`numero`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `stats`
--

DROP TABLE IF EXISTS `stats`;
/*!50001 DROP VIEW IF EXISTS `stats`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `stats` AS SELECT 
 1 AS `nome`,
 1 AS `socorrista`,
 1 AS `saidas`,
 1 AS `Apoios (tempo)`,
 1 AS `Emergência (tempo)`,
 1 AS `Formação (tempo)`,
 1 AS `Reunião (tempo)`,
 1 AS `Total`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `stats_2023`
--

DROP TABLE IF EXISTS `stats_2023`;
/*!50001 DROP VIEW IF EXISTS `stats_2023`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `stats_2023` AS SELECT 
 1 AS `nome`,
 1 AS `socorrista`,
 1 AS `saidas`,
 1 AS `Apoios (tempo)`,
 1 AS `Emergência (tempo)`,
 1 AS `Formação (tempo)`,
 1 AS `Reunião (tempo)`,
 1 AS `Total`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `stats_2023_1`
--

DROP TABLE IF EXISTS `stats_2023_1`;
/*!50001 DROP VIEW IF EXISTS `stats_2023_1`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `stats_2023_1` AS SELECT 
 1 AS `nome`,
 1 AS `socorrista`,
 1 AS `saidas`,
 1 AS `Apoios (tempo)`,
 1 AS `Emergência (tempo)`,
 1 AS `Formação (tempo)`,
 1 AS `Reunião (tempo)`,
 1 AS `Total`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `tipo_local`
--

DROP TABLE IF EXISTS `tipo_local`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_local` (
  `id` varchar(5) NOT NULL,
  `descricao` varchar(30) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipo_ocorrencia`
--

DROP TABLE IF EXISTS `tipo_ocorrencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_ocorrencia` (
  `id` varchar(5) NOT NULL,
  `descricao` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transporte`
--

DROP TABLE IF EXISTS `transporte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transporte` (
  `id` varchar(5) NOT NULL,
  `descricao` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` varchar(10) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `usuario` varchar(50) NOT NULL,
  `senha` varchar(50) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fbid` varchar(500) NOT NULL,
  `updated_by` varchar(11) NOT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios_hist`
--

DROP TABLE IF EXISTS `usuarios_hist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios_hist` (
  `id` varchar(10) NOT NULL,
  `nome` varchar(100) DEFAULT NULL,
  `usuario` varchar(50) DEFAULT NULL,
  `senha` varchar(50) DEFAULT NULL,
  `tipo` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT NULL,
  `fbid` varchar(500) DEFAULT NULL,
  `updated_by` varchar(11) DEFAULT NULL,
  `update_date` datetime NOT NULL,
  PRIMARY KEY (`id`,`update_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitas`
--

DROP TABLE IF EXISTS `visitas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitas` (
  `usuario` varchar(50) NOT NULL,
  `time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `ip` varchar(100) NOT NULL,
  `tipo_website` varchar(50) NOT NULL,
  PRIMARY KEY (`usuario`,`time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Current Database: `u127939263_cvp`
--

USE `u127939263_cvp`;

--
-- Final view structure for view `stats`
--

/*!50001 DROP VIEW IF EXISTS `stats`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`u127939263_653aced418fac`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `stats` AS (select `u127939263_cvp`.`usuarios`.`nome` AS `nome`,`stats`.`socorrista` AS `socorrista`,ifnull(`stats`.`saidas`,0) AS `saidas`,`stats`.`Apoio` AS `Apoios (tempo)`,`stats`.`Emergência` AS `Emergência (tempo)`,`stats`.`Formação` AS `Formação (tempo)`,`stats`.`Reunião` AS `Reunião (tempo)`,sec_to_time(time_to_sec(`stats`.`Apoio`) + time_to_sec(`stats`.`Emergência`) + time_to_sec(`stats`.`Formação`) + time_to_sec(`stats`.`Reunião`)) AS `Total` from ((select `stats_voluntariado`.`socorrista` AS `socorrista`,`stats_emergencia`.`saidas` AS `saidas`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Apoio' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Apoio`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Escala de Emergência' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Emergência`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Formação' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Formação`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Reunião' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Reunião` from ((select `u127939263_cvp`.`horas_voluntariado`.`socorrista` AS `socorrista`,`u127939263_cvp`.`horas_voluntariado`.`tipo` AS `tipo`,sec_to_time(sum(time_to_sec(`u127939263_cvp`.`horas_voluntariado`.`horas`))) AS `tempo` from `horas_voluntariado` where year(`u127939263_cvp`.`horas_voluntariado`.`data`) = 2022 group by `u127939263_cvp`.`horas_voluntariado`.`socorrista`,`u127939263_cvp`.`horas_voluntariado`.`tipo`) `stats_voluntariado` left join (select `emergencias`.`usuario` AS `usuario`,`emergencias`.`saidas` AS `saidas` from (select `emergencias`.`ano` AS `ano`,`emergencias`.`usuario` AS `usuario`,count(`emergencias`.`usuario`) AS `saidas` from (select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`condutor` AS `usuario` from `saidas` union all select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`socorrista1` AS `usuario` from `saidas` union all select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`socorrista2` AS `usuario` from `saidas` where `u127939263_cvp`.`saidas`.`socorrista2` <> 0) `emergencias` group by `emergencias`.`ano`,`emergencias`.`usuario`) `emergencias` where `emergencias`.`ano` = 2022) `stats_emergencia` on(`stats_voluntariado`.`socorrista` = `stats_emergencia`.`usuario`)) group by `stats_voluntariado`.`socorrista`,`stats_emergencia`.`saidas`) `stats` join `usuarios` on(`u127939263_cvp`.`usuarios`.`usuario` = `stats`.`socorrista`)) order by `stats`.`socorrista`) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `stats_2023`
--

/*!50001 DROP VIEW IF EXISTS `stats_2023`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`u127939263_653aced418fac`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `stats_2023` AS (select `u127939263_cvp`.`usuarios`.`nome` AS `nome`,`stats`.`socorrista` AS `socorrista`,ifnull(`stats`.`saidas`,0) AS `saidas`,`stats`.`Apoio` AS `Apoios (tempo)`,`stats`.`Emergência` AS `Emergência (tempo)`,`stats`.`Formação` AS `Formação (tempo)`,`stats`.`Reunião` AS `Reunião (tempo)`,sec_to_time(time_to_sec(`stats`.`Apoio`) + time_to_sec(`stats`.`Emergência`) + time_to_sec(`stats`.`Formação`) + time_to_sec(`stats`.`Reunião`)) AS `Total` from ((select `stats_voluntariado`.`socorrista` AS `socorrista`,`stats_emergencia`.`saidas` AS `saidas`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Apoio' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Apoio`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Escala de Emergência' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Emergência`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Formação' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Formação`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Reunião' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Reunião` from ((select `u127939263_cvp`.`horas_voluntariado`.`socorrista` AS `socorrista`,`u127939263_cvp`.`horas_voluntariado`.`tipo` AS `tipo`,sec_to_time(sum(time_to_sec(`u127939263_cvp`.`horas_voluntariado`.`horas`))) AS `tempo` from `horas_voluntariado` where year(`u127939263_cvp`.`horas_voluntariado`.`data`) = 2023 group by `u127939263_cvp`.`horas_voluntariado`.`socorrista`,`u127939263_cvp`.`horas_voluntariado`.`tipo`) `stats_voluntariado` left join (select `emergencias`.`usuario` AS `usuario`,`emergencias`.`saidas` AS `saidas` from (select `emergencias`.`ano` AS `ano`,`emergencias`.`usuario` AS `usuario`,count(`emergencias`.`usuario`) AS `saidas` from (select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`condutor` AS `usuario` from `saidas` union all select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`socorrista1` AS `usuario` from `saidas` union all select `u127939263_cvp`.`saidas`.`ano` AS `ano`,`u127939263_cvp`.`saidas`.`socorrista2` AS `usuario` from `saidas` where `u127939263_cvp`.`saidas`.`socorrista2` <> 0) `emergencias` group by `emergencias`.`ano`,`emergencias`.`usuario`) `emergencias` where `emergencias`.`ano` = 2023) `stats_emergencia` on(`stats_voluntariado`.`socorrista` = `stats_emergencia`.`usuario`)) group by `stats_voluntariado`.`socorrista`,`stats_emergencia`.`saidas`) `stats` join `usuarios` on(`u127939263_cvp`.`usuarios`.`usuario` = `stats`.`socorrista`)) order by `stats`.`socorrista`) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `stats_2023_1`
--

/*!50001 DROP VIEW IF EXISTS `stats_2023_1`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`u127939263_cvp`@`127.0.0.1` SQL SECURITY DEFINER */
/*!50001 VIEW `stats_2023_1` AS (select `usuarios`.`nome` AS `nome`,`stats`.`socorrista` AS `socorrista`,ifnull(`stats`.`saidas`,0) AS `saidas`,`stats`.`Apoio` AS `Apoios (tempo)`,`stats`.`Emergência` AS `Emergência (tempo)`,`stats`.`Formação` AS `Formação (tempo)`,`stats`.`Reunião` AS `Reunião (tempo)`,sec_to_time(time_to_sec(`stats`.`Apoio`) + time_to_sec(`stats`.`Emergência`) + time_to_sec(`stats`.`Formação`) + time_to_sec(`stats`.`Reunião`)) AS `Total` from ((select `stats_voluntariado`.`socorrista` AS `socorrista`,`stats_emergencia`.`saidas` AS `saidas`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Apoio' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Apoio`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Escala de Emergência' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Emergência`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Formação' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Formação`,ifnull(max(case when `stats_voluntariado`.`tipo` = 'Reunião' then `stats_voluntariado`.`tempo` end),'00:00:00') AS `Reunião` from ((select `horas_voluntariado`.`socorrista` AS `socorrista`,`horas_voluntariado`.`tipo` AS `tipo`,sec_to_time(sum(time_to_sec(`horas_voluntariado`.`horas`))) AS `tempo` from `horas_voluntariado` where year(`horas_voluntariado`.`data`) = 2023 group by `horas_voluntariado`.`socorrista`,`horas_voluntariado`.`tipo`) `stats_voluntariado` left join (select `emergencias`.`usuario` AS `usuario`,`emergencias`.`saidas` AS `saidas` from (select `emergencias`.`ano` AS `ano`,`emergencias`.`usuario` AS `usuario`,count(`emergencias`.`usuario`) AS `saidas` from (select `saidas`.`ano` AS `ano`,`saidas`.`condutor` AS `usuario` from `saidas` union all select `saidas`.`ano` AS `ano`,`saidas`.`socorrista1` AS `usuario` from `saidas` union all select `saidas`.`ano` AS `ano`,`saidas`.`socorrista2` AS `usuario` from `saidas` where `saidas`.`socorrista2` <> 0) `emergencias` group by `emergencias`.`ano`,`emergencias`.`usuario`) `emergencias` where `emergencias`.`ano` = 2023) `stats_emergencia` on(`stats_voluntariado`.`socorrista` = `stats_emergencia`.`usuario`)) group by `stats_voluntariado`.`socorrista`,`stats_emergencia`.`saidas`) `stats` join `usuarios` on(`usuarios`.`usuario` = `stats`.`socorrista`)) order by `stats`.`socorrista`) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-29 13:37:16
