"""Module docstring: a small sample."""
import dataclasses
from typing import Optional

MAX_SIZE = 1_024


def decorator(func):
    """Wrap a function."""
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper


@dataclasses.dataclass
class Point:
    x: float = 0.0
    y: float = 0.0

    @decorator
    def distance(self, other: Optional["Point"] = None) -> float:
        other = other or Point()
        value = ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5
        print(f"distance={value:.2f} from {self!r}", end="\n")
        return value

    def __repr__(self):
        return "Point(%s, %s)" % (self.x, self.y)


if __name__ == "__main__":
    points = [Point(x=i, y=i * 2) for i in range(3) if i is not None]
    print(len(points), True, None, b"bytes")
