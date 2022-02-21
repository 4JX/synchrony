import escodegen from 'escodegen'
import * as acorn from 'acorn' // no, it cannot be a default import
import { Transformer } from './transformers/transformer'
import { Program } from './util/types'
import Context from './context'
import prettier from 'prettier'
const FILE_REGEX = /(?<!\.d)\.[mc]?[jt]s$/i // cjs, mjs, js, ts, but no .d.ts

// TODO: remove this when https://github.com/acornjs/acorn/commit/a4a5510 lands
type ecmaVersion =
  | 3
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 2015
  | 2016
  | 2017
  | 2018
  | 2019
  | 2020
  | 2021
  | 2022
  | 'latest'

export interface DeobfuscateOptions {
  /**
   * ECMA version to use when parsing AST (see acorn, default = 'latest')
   */
  ecmaVersion: ecmaVersion

  /**
   * Custom transformers to use
   */
  customTransformers: typeof Transformer[]
}

export class Deobfuscator {
  public defaultOptions: DeobfuscateOptions = {
    ecmaVersion: 'latest',
    customTransformers: [],
  }

  private buildOptions(
    options: Partial<DeobfuscateOptions> = {}
  ): DeobfuscateOptions {
    return { ...this.defaultOptions, ...options }
  }

  public async deobfuscateNode(
    node: Program,
    _options?: Partial<DeobfuscateOptions>
  ): Promise<Program> {
    const options = this.buildOptions(_options)

    // TODO: fix control flow so its not duplicated 30 times
    const context = new Context(node, [
      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],
      ['LiteralMap', {}],

      ['StringDecoder', {}],

      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],

      ['ControlFlow', {}],
      ['ControlFlow', {}],
      ['ControlFlow', {}],
      ['ControlFlow', {}],
      ['ControlFlow', {}],
      ['Desequence', {}],
      ['MemberExpressionCleaner', {}],

      ['Simplify', {}],
      ['DeadCode', {}],

      ['Rename', {}],
    ])

    for (const t of context.transformers) {
      console.log('Running', t.name, 'transformer')
      await t.transform(context)
    }
    return context.ast
  }

  public async deobfuscateSource(
    source: string,
    _options?: Partial<DeobfuscateOptions>
  ): Promise<string> {
    const options = this.buildOptions(_options)
    let acornOptions: acorn.Options = {
      ecmaVersion: options.ecmaVersion,
    }
    let ast = acorn.parse(source, acornOptions) as Program

    // perform transforms
    ast = await this.deobfuscateNode(ast, options)

    source = escodegen.generate(ast, {
      comment: true,
    })
    try {
      source = prettier.format(source, {
        semi: false,
        singleQuote: true,

        parser: 'babel',
        // TODO: replace when https://github.com/prettier/prettier/issues/10244
        //       is fixed
        //       prettier does not support ChainExpressions emitted by acorn
        /*parser(text, _opts) {
          return acorn.parse(text, acornOptions)
        },*/
      })
    } catch (err) {
      // I don't think we should log here, but throwing the error is not very
      // important since it is non fatal
    }

    return source
  }
}
