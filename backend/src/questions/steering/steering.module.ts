import { Module } from '@nestjs/common';
import { ConceptCoverageService } from './concept-coverage.service';
import { EntityScarcityService } from './entity-scarcity.service';
import { SteeringService } from './steering.service';

@Module({
  providers: [ConceptCoverageService, EntityScarcityService, SteeringService],
  exports: [SteeringService],
})
export class SteeringModule {}
