import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000, // 60 segundos para testes com containers
    hookTimeout: 60000,
  },
});

