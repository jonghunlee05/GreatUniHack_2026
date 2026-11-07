import json
from pathlib import Path

import pytest

from purple.contracts import Chapter


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(params=["pcb_chapter.json", "economics_chapter.json"])
def chapter(request):
    return Chapter.model_validate(json.loads((ROOT / "examples" / request.param).read_text()))


@pytest.fixture
def pcb():
    return Chapter.model_validate(json.loads((ROOT / "examples" / "pcb_chapter.json").read_text()))
