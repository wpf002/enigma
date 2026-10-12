from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    """Wire models use camelCase so TypeScript and Python share one JSON shape."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
