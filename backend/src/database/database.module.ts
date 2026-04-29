import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { allEntities } from './entities';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL') ?? 'postgres://root:123456@localhost:5433/jan_rag',
        entities: allEntities,
        synchronize: false,
        logging: config.get<string>('TYPEORM_LOGGING') === 'true'
      })
    })
  ],
  exports: [TypeOrmModule]
})
export class DatabaseModule {}
