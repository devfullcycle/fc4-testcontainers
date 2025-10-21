import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LocalstackContainer, StartedLocalStackContainer } from '@testcontainers/localstack';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as fs from 'fs/promises';


describe('Integração com LocalStack - S3', () => {
  let container: StartedLocalStackContainer;
  let s3Client: S3Client;
  const testBucket = 'test-bucket';

  beforeAll(async () => {
    // Inicia o container LocalStack com S3
    container = await new LocalstackContainer('localstack/localstack:2.2.0')
      .withEnvironment({
        SERVICES: 's3',
      })
      .start();
    console.log(`LocalStack S3 rodando em: ${container.getConnectionUri()}`);

    // Configura o cliente S3 para usar LocalStack
    s3Client = new S3Client({
      endpoint: container.getConnectionUri(),
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true, // Necessário para LocalStack
    });
  });

  afterAll(async () => {
    await container.stop();
  });

  beforeEach(async () => {
    // Cria bucket de teste
    try {
      await s3Client.send(
        new CreateBucketCommand({ Bucket: testBucket })
      );
    } catch (error) {
      // Bucket pode já existir
    }
  });

  afterEach(async () => {
    // Limpa objetos do bucket
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: testBucket })
      );

      if (listResponse.Contents) {
        for (const obj of listResponse.Contents) {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: testBucket,
              Key: obj.Key!,
            })
          );
        }
      }

      await s3Client.send(
        new DeleteBucketCommand({ Bucket: testBucket })
      );
    } catch (error) {
      // Ignora erros de limpeza
    }
  });

  it('deve criar um bucket S3', async () => {
    const bucketName = 'new-test-bucket';
    
    const response = await s3Client.send(
      new CreateBucketCommand({ Bucket: bucketName })
    );

    expect(response.$metadata.httpStatusCode).toBe(200);

    // Cleanup
    await s3Client.send(
      new DeleteBucketCommand({ Bucket: bucketName })
    );
  });

  it('deve fazer upload de um objeto', async () => {
    const key = 'test-file.txt';
    const content = 'Hello from LocalStack S3!';

    const response = await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: key,
        Body: content,
        ContentType: 'text/plain',
      })
    );

    expect(response.$metadata.httpStatusCode).toBe(200);
    expect(response.ETag).toBeDefined();
  });

  it('deve fazer download de um objeto', async () => {
    const key = 'download-test.txt';
    const content = 'Content to download';

    // Upload
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: key,
        Body: content,
      })
    );

    // Download
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: testBucket,
        Key: key,
      })
    );

    const downloadedContent = await response.Body!.transformToString();
    expect(downloadedContent).toBe(content);
  });

  it('deve listar objetos em um bucket', async () => {
    // Upload de múltiplos objetos
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    
    for (const file of files) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: testBucket,
          Key: file,
          Body: `Content of ${file}`,
        })
      );
    }

    // Lista objetos
    const response = await s3Client.send(
      new ListObjectsV2Command({ Bucket: testBucket })
    );

    expect(response.Contents).toHaveLength(3);
    expect(response.Contents?.map(obj => obj.Key)).toEqual(
      expect.arrayContaining(files)
    );
  });

  it('deve deletar um objeto', async () => {
    const key = 'delete-me.txt';

    // Upload
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: key,
        Body: 'Delete this',
      })
    );

    // Delete
    const deleteResponse = await s3Client.send(
      new DeleteObjectCommand({
        Bucket: testBucket,
        Key: key,
      })
    );

    expect(deleteResponse.$metadata.httpStatusCode).toBe(204);

    // Verifica que foi deletado
    await expect(
      s3Client.send(
        new HeadObjectCommand({
          Bucket: testBucket,
          Key: key,
        })
      )
    ).rejects.toThrow();
  });

  it('deve fazer upload de arquivo grande com multipart', async () => {
    const key = 'large-file.bin';
    const largeContent = Buffer.alloc(6 * 1024 * 1024, 'a'); // 6MB

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: testBucket,
        Key: key,
        Body: largeContent,
      },
    });

    const response = await upload.done();
    expect(response.$metadata.httpStatusCode).toBe(200);

    // Verifica tamanho
    const headResponse = await s3Client.send(
      new HeadObjectCommand({
        Bucket: testBucket,
        Key: key,
      })
    );

    expect(headResponse.ContentLength).toBe(largeContent.length);
  });

  it('deve trabalhar com metadados de objetos', async () => {
    const key = 'file-with-metadata.txt';
    const metadata = {
      author: 'Test User',
      category: 'test',
      version: '1.0',
    };

    // Upload com metadados
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: key,
        Body: 'Content with metadata',
        Metadata: metadata,
        ContentType: 'text/plain',
      })
    );

    // Verifica metadados
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: testBucket,
        Key: key,
      })
    );

    expect(response.Metadata).toEqual(metadata);
    expect(response.ContentType).toBe('text/plain');
  });

  it('deve testar operações com prefixos (pastas virtuais)', async () => {
    const files = [
      'documents/file1.txt',
      'documents/file2.txt',
      'images/photo1.jpg',
      'images/photo2.jpg',
    ];

    // Upload de arquivos em "pastas"
    for (const file of files) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: testBucket,
          Key: file,
          Body: `Content of ${file}`,
        })
      );
    }

    // Lista apenas documentos
    const docsResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: testBucket,
        Prefix: 'documents/',
      })
    );

    expect(docsResponse.Contents).toHaveLength(2);
    expect(docsResponse.Contents?.every(obj => obj.Key?.startsWith('documents/'))).toBe(true);
  });

  it('deve fazer upload de arquivo do sistema de arquivos', async () => {
    const tempFile = '/tmp/test-upload.txt';
    const content = 'File from filesystem';
    
    await fs.writeFile(tempFile, content);

    const fileContent = await fs.readFile(tempFile);
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: 'uploaded-file.txt',
        Body: fileContent,
      })
    );

    // Verifica upload
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: testBucket,
        Key: 'uploaded-file.txt',
      })
    );

    const downloaded = await response.Body!.transformToString();
    expect(downloaded).toBe(content);

    await fs.unlink(tempFile);
  });

  it('deve simular processamento de arquivos CSV', async () => {
    const csvContent = 'name,email,age\nJohn,john@example.com,30\nJane,jane@example.com,25';
    
    // Upload CSV
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucket,
        Key: 'data/users.csv',
        Body: csvContent,
        ContentType: 'text/csv',
      })
    );

    // Download e processa
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: testBucket,
        Key: 'data/users.csv',
      })
    );

    const content = await response.Body!.transformToString();
    const lines = content.split('\n');
    const dataLines = lines.slice(1); // Remove header
    
    expect(dataLines).toHaveLength(2);
    expect(content).toContain('John');
    expect(content).toContain('Jane');
  });
});