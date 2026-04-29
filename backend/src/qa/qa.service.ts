import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { GroupsService } from '../groups/groups.service';
import { BusinessError, compactText, requirePositiveNumber } from '../common/errors';
import { ChatModelService, HybridRetrievalService } from '../retrieval/retrieval.service';

@Injectable()
export class QaService {
  constructor(private readonly groups: GroupsService, private readonly retrieval: HybridRetrievalService, private readonly chat: ChatModelService) {}

  async ask(request: Request, body: any) {
    const groupId = requirePositiveNumber(body?.groupId, 'groupId');
    const question = compactText(body?.question);
    if (!question) throw new BusinessError('question is required');
    await this.groups.requireGroupReadable(request, groupId);
    return this.askTrusted(groupId, question);
  }

  async askTrusted(groupId: number, question: string) {
    const bundle = await this.retrieval.retrieve(groupId, question, 5);
    if (!bundle.evidences.length) {
      return { answered: false, answer: null, reasonCode: 'INSUFFICIENT_EVIDENCE', reasonMessage: 'Retrieved evidence is insufficient; cannot answer.', citations: [] };
    }
    const prompt = 'Answer strictly from the evidence. Return JSON only: {"answered":true,"answer":"...","reasonCode":null,"reasonMessage":null}. If evidence is insufficient, answered=false.\nQuestion: ' + question + '\nEvidence level: ' + bundle.evidenceLevel + '\nGuidance: ' + bundle.evidenceGuidance + '\nEvidence:\n' + bundle.evidences.map(e => '[' + e.evidenceId + '] ' + e.text).join('\n\n');
    const raw = await this.chat.complete(prompt);
    if (!raw) {
      return { answered: true, answer: 'Retrieved relevant evidence, but no chat model is configured to generate the final answer.', reasonCode: null, reasonMessage: null, citations: bundle.citations };
    }
    try {
      const parsed = JSON.parse(raw.replace(/^\x60\x60\x60json/i, '').replace(/\x60\x60\x60$/i, '').trim());
      if (!parsed.answered || !compactText(parsed.answer)) {
        return { answered: false, answer: null, reasonCode: parsed.reasonCode ?? 'INSUFFICIENT_EVIDENCE', reasonMessage: parsed.reasonMessage ?? 'Evidence is insufficient.', citations: [] };
      }
      return { answered: true, answer: compactText(parsed.answer), reasonCode: null, reasonMessage: null, citations: bundle.citations };
    } catch {
      return { answered: false, answer: null, reasonCode: 'ANSWER_FORMAT_ERROR', reasonMessage: 'Model returned an invalid answer format.', citations: [] };
    }
  }
}
