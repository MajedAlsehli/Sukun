import swaggerJsdoc from 'swagger-jsdoc';

// Task 019 (Documentation) will expand this with full response schemas;
// each module registers its own JSDoc'd routes file here as it's built.
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sukun Platform API',
      version: '2.0.0',
      description: 'AI-powered residential experience platform - backend API',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: [
    // dev runs ts-node-dev against src/, prod runs compiled dist/ - cover both.
    './src/**/*.routes.ts',
    './dist/**/*.routes.js',
  ],
});
