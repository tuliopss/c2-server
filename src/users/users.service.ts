import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UUID } from 'crypto';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import validator from 'validator';
import { plainToClass } from 'class-transformer';
import { AuthService } from 'src/auth/auth.service';
import { SkillsService } from 'src/skills/skills.service';
import { RolesService } from 'src/roles/roles.service';
import { AwsService } from 'src/aws/aws.service';
@Injectable()
export class UsersService {
  logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly skillsService: SkillsService,
    private readonly rolesService: RolesService,
    private readonly awsService: AwsService,
  ) {}

  async createUser(
    createUserDto: CreateUserDto,
  ): Promise<{ user: User; token: string }> {
    try {
      const checkEmailUser = await this.findByEmail(createUserDto.email);

      if (checkEmailUser) throw new ConflictException('Usuário já cadastrado!');

      const user = this.userRepository.create(createUserDto);

      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(user.password, salt);
      user.password = passwordHash;

      const savedUser = await this.userRepository.save(user);
      const { token } = await this.authService.generateJwtToken(
        savedUser.email,
        savedUser,
      );

      return { user: plainToClass(User, savedUser), token };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async getAllUsers(): Promise<User[] | null> {
    try {
      const users = await this.userRepository.find();

      if (users.length === 0) {
        throw new NotFoundException(`Não há usuários cadastrados...`);
      }

      return users;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException();
    }
  }

  async getUserById(id: UUID) {
    try {
      if (!validator.isUUID(id)) {
        throw new BadRequestException('ID inválido.');
      }

      const user = await this.userRepository.findOne({
        where: { id },
      });

      if (!user) throw new NotFoundException('Usuário não encontrado!');

      return user;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async updateUser(
    id: UUID,
    updateUserDto: UpdateUserDto,
    file?: any,
  ): Promise<User> {
    try {
      const user = await this.getUserById(id);

      if (updateUserDto.linkedin) {
        const checkLinkedinUser = await this.userRepository.findOne({
          where: { linkedin: updateUserDto.linkedin },
        });

        if (checkLinkedinUser)
          throw new ConflictException('Linkedin já cadastrado!');
      }

      if (updateUserDto.github) {
        const checkGitHubUser = await this.userRepository.findOne({
          where: { github: updateUserDto.github },
        });

        if (checkGitHubUser)
          throw new ConflictException('GitHub já cadastrado!');
      }

      if (updateUserDto.skillId) {
        const skill = await this.skillsService.getSkillById(
          updateUserDto.skillId,
        );

        user.skill = skill;

        const updatedUser = await this.userRepository.save(user);

        return updatedUser;
      }
      if (updateUserDto.roleId) {
        const role = await this.rolesService.getRoleById(updateUserDto.roleId);

        user.role = role;

        const updatedUser = await this.userRepository.save(user);

        return updatedUser;
      }

      const urlPhotoUser = await this.awsService.uploadFile(file, id);
      console.log(urlPhotoUser.url);
      updateUserDto.urlPhoto = urlPhotoUser.url;
      console.log(user);

      await this.userRepository.update(id, updateUserDto);
      return await this.getUserById(id);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async remove(id: UUID): Promise<string> {
    try {
      if (!validator.isUUID(id)) {
        throw new BadRequestException('ID inválido.');
      }
      const user = await this.getUserById(id);

      this.userRepository.remove(user);
      return 'Usuário Removido';
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  findByEmail(userEmail: string): Promise<User> {
    return this.userRepository.findOne({
      where: {
        email: userEmail,
      },
    });
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.findByEmail(email);

    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
