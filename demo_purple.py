"""Standalone TeachBack demo for the purple modules."""

from __future__ import annotations

import json
from pathlib import Path

import streamlit as st

from purple.alex_engine import AlexBrain
from purple.assessment import render_assessment_room
from purple.contracts import AssessmentTask, Attempt, Chapter
from purple.report import render_report_room
from purple.state import initialise, key
from purple.teaching import render_teaching_room

ROOT = Path(__file__).resolve().parent

st.set_page_config(page_title="TeachBack · Purple Rooms", page_icon="🧑‍🚀", layout="wide")
st.markdown(
    """
    <style>
      .stApp { background: radial-gradient(circle at 80% 0%, #241643 0, #0d0b16 42%, #09080f 100%); color: #f5f0ff; }
      [data-testid="stSidebar"] { background: #130f20; border-right: 1px solid #3b2b55; }
      .stButton > button[kind="primary"] { background: linear-gradient(90deg,#7c3aed,#a855f7); border: 0; }
      div[data-testid="stExpander"], div[data-testid="stMetric"] { border-color: #5b3b7c; background: rgba(33,24,48,.65); }
      blockquote { border-left-color: #a855f7 !important; color: #e9d5ff !important; }
    </style>
    """,
    unsafe_allow_html=True,
)


def load_chapter(filename: str) -> Chapter:
    return Chapter.model_validate(json.loads((ROOT / "examples" / filename).read_text()))


subjects = {
    "PCB Reliability": "pcb_chapter.json",
    "Economics": "economics_chapter.json",
}
selected = st.sidebar.selectbox("Demo chapter", subjects, key="purple_demo_subject")
chapter = load_chapter(subjects[selected])
initialise(st.session_state, chapter)

brain = AlexBrain.model_validate(st.session_state[key("brain")])
task = AssessmentTask.model_validate(st.session_state[key("task")])
attempt = Attempt.model_validate(st.session_state[key("attempt")])
room = st.session_state[key("room")]

st.sidebar.caption("Flow: Teaching → Assessment → Report → Repair → Rematch")
if room == "teaching":
    render_teaching_room(chapter, brain)
elif room == "assessment":
    render_assessment_room(chapter, brain, task, attempt)
elif room == "report":
    render_report_room(chapter, brain, task, attempt)
