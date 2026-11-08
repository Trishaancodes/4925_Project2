-- Matches docs/erd.drawio

CREATE TABLE IF NOT EXISTS `user` (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `template` (
  template_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  name        VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `template_version` (
  version_id     INT AUTO_INCREMENT PRIMARY KEY,
  template_id    INT      NOT NULL,
  version_number INT      NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (template_id, version_number),
  FOREIGN KEY (template_id) REFERENCES `template` (template_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `template_field` (
  field_id    INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT          NOT NULL,
  name        VARCHAR(100) NOT NULL,
  type        ENUM('boolean', 'text', 'textarea', 'dropdown', 'date', 'number', 'email', 'url') NOT NULL,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  rules       JSON         NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  UNIQUE (version_id, name),
  FOREIGN KEY (version_id) REFERENCES `template_version` (version_id) ON DELETE CASCADE
);

-- A list follows its template's newest version
CREATE TABLE IF NOT EXISTS `list` (
  list_id     INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  template_id INT          NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE,
  -- A template can't be deleted while a list still uses it
  FOREIGN KEY (template_id) REFERENCES `template` (template_id) ON DELETE RESTRICT
);

-- Each entry remembers the version whose rules it was last validated against.
-- New entries (and edited old ones) use the newest version.
CREATE TABLE IF NOT EXISTS `list_entry` (
  entry_id   INT AUTO_INCREMENT PRIMARY KEY,
  list_id    INT      NOT NULL,
  version_id INT      NOT NULL,
  data       JSON     NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES `list` (list_id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES `template_version` (version_id) ON DELETE RESTRICT
);

-- Upgrades a database created before the number/email/url types existed (safe to run again)
ALTER TABLE `template_field`
  MODIFY type ENUM('boolean', 'text', 'textarea', 'dropdown', 'date', 'number', 'email', 'url') NOT NULL;
