import "server-only";
import type { Chapter, Game } from "@/lib/game-schema";
import { courseCode } from "@/lib/game-display";
import {
  chapterIdFor,
  type Agent2Input,
  type ChapterPack,
  type KnowledgeDebt,
} from "@/lib/chapter-pack";

/**
 * Adapts Agent 1's outline entry for ONE chapter into Agent 2's input
 * (spec section 2). Never sends the whole course.
 *
 * Mapping from Agent 1:
 *  - chapter_id      = "ch<week>"
 *  - main_ilo        = first ILO's statement; supporting_ilos = the rest
 *  - key_events[i]   = chapter.keyEvents[i] with id "ev<i+1>"
 *  - sources[i]      = chapter.sourceRefs[i] with id "src<i+1>"
 *  - previous_chapter = previous chapter's pack concepts + knowledge debt (empty for chapter 1)
 */
export function buildAgent2Input(
  game: Game,
  chapter: Chapter,
  previous: { pack: ChapterPack | null; knowledgeDebt: KnowledgeDebt[] } | null,
): Agent2Input {
  const [mainIlo, ...supporting] = chapter.ilos;

  return {
    course: { code: courseCode(game), title: game.course.name },
    chapter: {
      chapter_id: chapterIdFor(chapter.week),
      week: chapter.week,
      title: chapter.title,
      main_ilo: mainIlo?.statement ?? chapter.summary,
      supporting_ilos: supporting.map((i) => i.statement),
      key_events: chapter.keyEvents.map((e, i) => ({
        id: `ev${i + 1}`,
        year: e.year,
        person: e.person,
        event: e.event,
      })),
      sources: chapter.sourceRefs.map((s, i) => ({
        id: `src${i + 1}`,
        file: s.file,
        page: s.page,
        excerpt: s.excerpt,
      })),
    },
    previous_chapter: {
      concepts: previous?.pack?.concepts ?? [],
      knowledge_debt: previous?.knowledgeDebt ?? [],
    },
  };
}
