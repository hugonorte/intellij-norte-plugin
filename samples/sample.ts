import { Injectable } from './di';

/** A repository of items. */
export interface Repository<T extends { id: number }> {
  readonly name: string;
  find(id: number): Promise<T | undefined>;
}

type Status = 'active' | 'disabled';

enum Color { Red = 1, Green, Blue }

@Injectable({ singleton: true })
export class MemoryRepository<T extends { id: number }> implements Repository<T> {
  private readonly items = new Map<number, T>();
  constructor(public readonly name: string) {}

  async find(id: number): Promise<T | undefined> {
    const item = this.items.get(id) as T;
    return item ?? undefined;
  }

  static create<U extends { id: number }>(name: string): MemoryRepository<U> {
    return new MemoryRepository<U>(name);
  }
}

function isActive(s: Status): s is 'active' {
  return s === 'active' && Color.Green > 1;
}
