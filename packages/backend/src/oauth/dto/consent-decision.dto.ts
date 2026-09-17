import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConsentDecisionDto {
  /** The signed ticket `GET /oauth/consent/:ticket` was loaded with. */
  @ApiProperty()
  @IsString()
  ticket: string;

  @ApiProperty({ enum: ['allow', 'deny'] })
  @IsIn(['allow', 'deny'])
  decision: 'allow' | 'deny';
}
