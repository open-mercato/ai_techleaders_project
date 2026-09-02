import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import type { ApiRouteContext } from './apiHandler';
import {
  makeCrudRoute,
  type CrudService,
  type MakeCrudRouteOptions,
} from './makeCrudRoute';

const testState = vi.hoisted(() => ({
  cradle: {} as unknown,
  withScope: vi.fn(),
}));

vi.mock('../container/container', () => ({
  withScope: testState.withScope,
}));

type Entity = { id: string; name: string };
type Input = { name: string };

const inputSchema = z.object({ name: z.string().min(1) });

function context(params?: Record<string, string | string[]>): ApiRouteContext {
  return params === undefined
    ? (undefined as unknown as ApiRouteContext)
    : { params: Promise.resolve(params) };
}

function request(method: string, body?: string): Request {
  return new Request('http://devmentor.test/api/resources', {
    method,
    ...(body === undefined
      ? {}
      : { body, headers: { 'content-type': 'application/json' } }),
  });
}

async function body(response: Response) {
  return response.json() as Promise<unknown>;
}

function service(overrides: Partial<CrudService<Entity, Input, Input>> = {}) {
  return {
    list: vi.fn(async () => [{ id: '1', name: 'Ada' }]),
    get: vi.fn(async (id: string) => ({ id, name: 'Ada' })),
    create: vi.fn(async (data: Input) => ({ id: 'created', ...data })),
    update: vi.fn(async (id: string, data: Input) => ({ id, ...data })),
    delete: vi.fn(async () => undefined),
    ...overrides,
  } satisfies CrudService<Entity, Input, Input>;
}

function route(
  currentService: CrudService<Entity, Input, Input>,
  overrides: Partial<MakeCrudRouteOptions<Entity, Input, Input>> = {},
) {
  return makeCrudRoute<Entity, Input, Input>({
    resolve: () => currentService,
    createSchema: inputSchema,
    updateSchema: inputSchema,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.withScope.mockImplementation(
    async (callback: (cradle: Cradle) => Promise<unknown>) =>
      callback(testState.cradle as Cradle),
  );
});

describe('makeCrudRoute GET', () => {
  it('lists a collection with no route context and runs authorization', async () => {
    const currentService = service();
    const authorize = vi.fn();
    const handlers = route(currentService, { authorize });
    const req = request('GET');

    const response = await handlers.GET(req, context());

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      ok: true,
      data: [{ id: '1', name: 'Ada' }],
    });
    expect(authorize).toHaveBeenCalledWith(req, testState.cradle);
    expect(currentService.list).toHaveBeenCalledOnce();
  });

  it('lists when an empty params object is provided', async () => {
    const currentService = service();
    const response = await route(currentService).GET(request('GET'), context({}));

    expect(response.status).toBe(200);
    expect(currentService.list).toHaveBeenCalledOnce();
  });

  it('gets one entity using the default id parameter', async () => {
    const currentService = service();
    const response = await route(currentService).GET(
      request('GET'),
      context({ id: 'resource-1' }),
    );

    expect(await body(response)).toEqual({
      ok: true,
      data: { id: 'resource-1', name: 'Ada' },
    });
    expect(currentService.get).toHaveBeenCalledWith('resource-1');
  });

  it('uses the first array value from a custom id parameter', async () => {
    const currentService = service();
    const response = await route(currentService, { idParam: 'slug' }).GET(
      request('GET'),
      context({ slug: ['first', 'ignored'] }),
    );

    expect(response.status).toBe(200);
    expect(currentService.get).toHaveBeenCalledWith('first');
  });

  it('returns a bad request when item lookup is unsupported', async () => {
    const currentService = service({ get: undefined });
    const response = await route(currentService).GET(
      request('GET'),
      context({ id: 'resource-1' }),
    );

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'This operation is not supported',
      },
    });
  });
});

describe('makeCrudRoute POST', () => {
  it('parses and creates an entity', async () => {
    const currentService = service();
    const response = await route(currentService).POST(
      request('POST', JSON.stringify({ name: 'Grace' })),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      ok: true,
      data: { id: 'created', name: 'Grace' },
    });
    expect(currentService.create).toHaveBeenCalledWith({ name: 'Grace' });
  });

  it('rejects malformed JSON', async () => {
    const response = await route(service()).POST(request('POST', '{'), context());

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      ok: false,
      error: {
        code: 'bad_request',
        message: 'Request body must be valid JSON',
      },
    });
  });

  it('flattens field, repeated, and root validation issues', async () => {
    const schema = z
      .object({
        name: z.string().min(2, 'too short').regex(/^[A-Z]/, 'must start uppercase'),
      })
      .refine(() => false, 'root problem');
    const response = await route(service(), { createSchema: schema }).POST(
      request('POST', JSON.stringify({ name: '' })),
      context(),
    );

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Validation failed',
        fieldErrors: {
          name: ['too short', 'must start uppercase'],
          _root: ['root problem'],
        },
      },
    });
  });

  it('rejects creation when the service method is absent', async () => {
    const response = await route(service({ create: undefined })).POST(
      request('POST', JSON.stringify({ name: 'Grace' })),
      context(),
    );

    expect(response.status).toBe(400);
  });

  it('rejects creation when the schema is absent', async () => {
    const response = await route(service(), { createSchema: undefined }).POST(
      request('POST', JSON.stringify({ name: 'Grace' })),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { message: 'This operation is not supported' },
    });
  });
});

describe('makeCrudRoute PUT', () => {
  it('parses and updates an entity', async () => {
    const currentService = service();
    const response = await route(currentService).PUT(
      request('PUT', JSON.stringify({ name: 'Katherine' })),
      context({ id: 'resource-2' }),
    );

    expect(response.status).toBe(200);
    expect(currentService.update).toHaveBeenCalledWith('resource-2', {
      name: 'Katherine',
    });
  });

  it('requires an id', async () => {
    const response = await route(service()).PUT(
      request('PUT', JSON.stringify({ name: 'Katherine' })),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: { message: 'Missing resource id' } });
  });

  it('rejects updates when the service method is absent', async () => {
    const response = await route(service({ update: undefined })).PUT(
      request('PUT', JSON.stringify({ name: 'Katherine' })),
      context({ id: 'resource-2' }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects updates when the schema is absent', async () => {
    const response = await route(service(), { updateSchema: undefined }).PUT(
      request('PUT', JSON.stringify({ name: 'Katherine' })),
      context({ id: 'resource-2' }),
    );

    expect(response.status).toBe(400);
  });
});

describe('makeCrudRoute DELETE', () => {
  it('deletes an entity and returns its id', async () => {
    const currentService = service();
    const response = await route(currentService).DELETE(
      request('DELETE'),
      context({ id: 'resource-3' }),
    );

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, data: { id: 'resource-3' } });
    expect(currentService.delete).toHaveBeenCalledWith('resource-3');
  });

  it('requires an id', async () => {
    const response = await route(service()).DELETE(request('DELETE'), context());

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: { message: 'Missing resource id' } });
  });

  it('rejects deletion when the service method is absent', async () => {
    const response = await route(service({ delete: undefined })).DELETE(
      request('DELETE'),
      context({ id: 'resource-3' }),
    );

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { message: 'This operation is not supported' },
    });
  });
});
