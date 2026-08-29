from typing import Literal

from pydantic import BaseModel


class BaselineClassification(BaseModel):
    category: Literal["Account Access", "Hardware", "Network", "Software"]
    priority: Literal["Low", "Medium", "High"]