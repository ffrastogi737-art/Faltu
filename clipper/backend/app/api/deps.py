from typing import Type, TypeVar

from fastapi import HTTPException

T = TypeVar("T")


def get_or_404(db, model: Type[T], id_: int) -> T:
    obj = db.get(model, id_)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {id_} not found")
    return obj


def apply(obj, data) -> None:
    """Copy the fields the client actually sent onto a model row."""
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
