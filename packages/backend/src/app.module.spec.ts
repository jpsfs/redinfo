import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * The application wires up.
 *
 * Every other test constructs a service by hand, which is what makes them fast
 * and focused — and also what makes them blind to dependency-injection
 * mistakes. This compiles the real module graph, so a provider Nest cannot
 * resolve fails here rather than at the first deployment.
 *
 * Postgres is replaced with a stub: the question is whether the graph resolves,
 * not whether it can reach a database.
 */
describe('AppModule', () => {
  it('resolves every provider in the graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('can start and stop, so lifecycle hooks are wired too', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
