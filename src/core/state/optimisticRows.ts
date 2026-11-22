import { shallowRef } from 'vue';

export function createOptimisticRows<Row extends { id: string }>() {
  type Edit = { ids: ReadonlySet<string>; change: (row: Row) => Row };
  const pending = shallowRef<readonly Edit[]>([]);
  const writes = new Map<string, Promise<void>>();

  function project(row: Row): Row {
    for (const edit of pending.value) if (edit.ids.has(row.id)) row = edit.change(row);
    return row;
  }

  async function run<Result>(
    ids: readonly string[],
    change: (row: Row) => Row,
    write: () => Promise<Result>,
    accept: (result: Result) => void,
  ): Promise<Result> {
    const edit: Edit = { ids: new Set(ids), change };
    pending.value = [...pending.value, edit];
    const previous = new Set(ids.map((id) => writes.get(id)));
    const request = Promise.all(previous).then(async () => {
      const result = await write();
      accept(result);
      return result;
    });
    // Serialize actual writes to each row so an older request cannot win on the server.
    const done = request.then(
      () => {},
      () => {},
    );
    for (const id of ids) writes.set(id, done);
    try {
      return await request;
    } finally {
      pending.value = pending.value.filter((item) => item !== edit);
      for (const id of ids) if (writes.get(id) === done) writes.delete(id);
    }
  }

  return { project, run };
}
