import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** ФТ-D6: публикация курса центра-источника в каталог платформы. */
export class PublishLibraryCourseRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sourceTenantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  courseId!: string;
}
