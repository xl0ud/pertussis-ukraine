#!/bin/bash
# Скрипт автоматичного відкату до стабільної робочої версії
set -e

echo "=== Відкат проєкту до стабільного стану (v1.0-stable) ==="

TARGET_DIR="/home/xl0ud/epipulse-ukraine"
BACKUP_DIR="/home/xl0ud/epipulse-ukraine-backup"

if [ -d "$TARGET_DIR/.git" ]; then
    echo "1. Відновлення через Git (тег v1.0-stable)..."
    cd "$TARGET_DIR"
    git reset --hard v1.0-stable
    git clean -fd
    echo "Успішно відновлено через Git!"
elif [ -d "$BACKUP_DIR" ]; then
    echo "1. Git не знайдено, відновлення з папки бекапу..."
    cp -r "$BACKUP_DIR"/* "$TARGET_DIR"/
    echo "Успішно скопійовано з резервної папки!"
else
    echo "Помилка: не знайдено джерела для відновлення."
    exit 1
fi

echo ""
echo "Готово! Проєкт повернуто до 100% робочого стану."
