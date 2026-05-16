import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import {
  ChatModelService,
  ElasticsearchService,
  EmbeddingService,
  HybridRetrievalService,
  QueryPlanningService
} from './retrieval.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    ChatModelService,
    EmbeddingService,
    ElasticsearchService,
    QueryPlanningService,
    HybridRetrievalService
  ],
  exports: [
    ChatModelService,
    EmbeddingService,
    ElasticsearchService,
    QueryPlanningService,
    HybridRetrievalService
  ]
})
export class RetrievalModule {}
