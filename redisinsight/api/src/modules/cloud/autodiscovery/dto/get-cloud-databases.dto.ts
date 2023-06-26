import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty, IsArray, IsNotEmpty, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GetCloudSubscriptionDatabasesDto,
} from 'src/modules/cloud/autodiscovery/dto/get-cloud-subscription-databases.dto';

export class GetCloudDatabasesDto {
  @ApiProperty({
    description: 'Subscriptions where to discover databases',
    type: GetCloudSubscriptionDatabasesDto,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested()
  @Type(() => GetCloudSubscriptionDatabasesDto)
  subscriptions: GetCloudSubscriptionDatabasesDto[];
}
