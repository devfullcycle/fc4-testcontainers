# Limpa containers do Testcontainers
docker ps -a --filter "label=org.testcontainers=true" -q | xargs -r docker rm -fv
echo "✓ Containers removidos (incluindo volumes anônimos)"

# Limpa volumes com label do Testcontainers
docker volume ls --filter "label=org.testcontainers=true" -q | xargs -r docker volume rm
echo "✓ Volumes com label removidos"

# Limpa networks do Testcontainers
docker network ls --filter "label=org.testcontainers=true" -q | xargs -r docker network rm
echo "✓ Networks removidas"

echo "✅ Limpeza do Testcontainers concluída!"